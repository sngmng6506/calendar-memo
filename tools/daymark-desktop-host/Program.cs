using System.Runtime.InteropServices;
using System.Text.Json;

static class Program
{
    private const uint SpawnWorkerW = 0x052C;
    private const uint SmtoNormal = 0x0000;
    private const int GwlStyle = -16;
    private const int GwlExStyle = -20;
    private const long WsChild = 0x40000000;
    private const long WsPopup = 0x80000000;
    private const long WsCaption = 0x00C00000;
    private const long WsThickFrame = 0x00040000;
    private const long WsMinimizeBox = 0x00020000;
    private const long WsMaximizeBox = 0x00010000;
    private const long WsSysMenu = 0x00080000;
    private const uint SwpNoSendChanging = 0x0400;
    private const uint SwpNoSize = 0x0001;
    private const uint SwpNoMove = 0x0002;
    private const uint SwpNoActivate = 0x0010;
    private const uint SwpShowWindow = 0x0040;
    private const uint SwpFrameChanged = 0x0020;
    private static readonly IntPtr HwndBottom = new(1);

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                WriteFailure("명령이 없습니다.");
                return 0;
            }

            switch (args[0].ToLowerInvariant())
            {
                case "attach":
                    Attach(args);
                    return 0;
                case "detach":
                    Detach(args);
                    return 0;
                case "probe":
                    Probe();
                    return 0;
                default:
                    WriteFailure($"알 수 없는 명령입니다: {args[0]}");
                    return 0;
            }
        }
        catch (Exception ex)
        {
            WriteFailure(ex.Message);
            return 0;
        }
    }

    private static void Attach(string[] args)
    {
        var values = ParseArgs(args);
        var hwnd = ReadHandle(values, "hwnd");
        var x = ReadInt(values, "x");
        var y = ReadInt(values, "y");
        var width = ReadInt(values, "width");
        var height = ReadInt(values, "height");

        if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
        {
            WriteFailure("Electron 창 핸들을 찾지 못했습니다.");
            return;
        }

        var worker = FindWorkerWBehindIcons();
        if (worker == IntPtr.Zero || !IsWindow(worker))
        {
            WriteFailure("아이콘 뒤 WorkerW 바탕화면 레이어를 찾지 못했습니다.");
            return;
        }

        var parent = GetParent(hwnd);
        var style = GetWindowLongPtr(hwnd, GwlStyle).ToInt64();
        var exStyle = GetWindowLongPtr(hwnd, GwlExStyle).ToInt64();
        var desktopStyle = (style & ~(WsPopup | WsCaption | WsThickFrame | WsMinimizeBox | WsMaximizeBox | WsSysMenu)) | WsChild;

        if (!GetWindowRect(worker, out var workerRect))
        {
            WriteFailure("WorkerW 위치를 읽지 못했습니다.");
            return;
        }

        SetWindowLongPtr(hwnd, GwlStyle, new IntPtr(desktopStyle));
        SetParent(hwnd, worker);
        var relativeX = x - workerRect.Left;
        var relativeY = y - workerRect.Top;
        SetWindowPos(hwnd, HwndBottom, relativeX, relativeY, width, height, SwpNoActivate | SwpShowWindow | SwpFrameChanged | SwpNoSendChanging);

        WriteSuccess(new
        {
            worker = worker.ToInt64(),
            parent = parent.ToInt64(),
            style,
            exStyle
        });
    }

    private static void Detach(string[] args)
    {
        var values = ParseArgs(args);
        var hwnd = ReadHandle(values, "hwnd");
        var parent = ReadHandle(values, "parent", allowMissing: true);
        var style = ReadLong(values, "style", allowMissing: true);
        var exStyle = ReadLong(values, "exStyle", allowMissing: true);

        if (hwnd == IntPtr.Zero || !IsWindow(hwnd))
        {
            WriteFailure("Electron 창 핸들을 찾지 못했습니다.");
            return;
        }

        SetParent(hwnd, parent);
        if (style != 0) SetWindowLongPtr(hwnd, GwlStyle, new IntPtr(style));
        if (exStyle != 0) SetWindowLongPtr(hwnd, GwlExStyle, new IntPtr(exStyle));
        SetWindowPos(hwnd, IntPtr.Zero, 0, 0, 0, 0, SwpNoActivate | SwpNoSize | SwpNoMove | SwpFrameChanged | SwpNoSendChanging);
        WriteSuccess(new { });
    }

    private static void Probe()
    {
        var worker = FindWorkerWBehindIcons();
        if (worker == IntPtr.Zero)
        {
            WriteFailure("아이콘 뒤 WorkerW 바탕화면 레이어를 찾지 못했습니다.");
            return;
        }
        WriteSuccess(new { worker = worker.ToInt64() });
    }

    private static IntPtr FindWorkerWBehindIcons()
    {
        var progman = FindWindowW("Progman", null);
        if (progman == IntPtr.Zero) return IntPtr.Zero;

        foreach (var pair in new[] { (UIntPtr.Zero, IntPtr.Zero), ((UIntPtr)0xD, IntPtr.Zero), ((UIntPtr)0xD, new IntPtr(1)) })
        {
            SendMessageTimeoutW(progman, SpawnWorkerW, pair.Item1, pair.Item2, SmtoNormal, 1000, out _);
        }

        var desktopParent = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            var defView = FindWindowExW(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (defView != IntPtr.Zero)
            {
                var sibling = FindWindowExW(IntPtr.Zero, hwnd, "WorkerW", null);
                if (sibling != IntPtr.Zero && FindWindowExW(sibling, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
                {
                    desktopParent = sibling;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);
        if (desktopParent != IntPtr.Zero) return desktopParent;

        var previous = IntPtr.Zero;
        while (true)
        {
            var candidate = FindWindowExW(IntPtr.Zero, previous, "WorkerW", null);
            if (candidate == IntPtr.Zero) break;
            previous = candidate;
            if (FindWindowExW(candidate, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
            {
                return candidate;
            }
        }

        // Some Explorer states keep icons directly under Progman and never expose a blank WorkerW.
        // Use Progman as a conservative fallback and keep the child at the bottom of its z-order.
        if (FindWindowExW(progman, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
        {
            return progman;
        }

        return IntPtr.Zero;
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 1; index < args.Length; index++)
        {
            var key = args[index].TrimStart('-');
            if (index + 1 >= args.Length) break;
            result[key] = args[++index];
        }
        return result;
    }

    private static IntPtr ReadHandle(Dictionary<string, string> values, string key, bool allowMissing = false)
    {
        if (!values.TryGetValue(key, out var raw))
        {
            if (allowMissing) return IntPtr.Zero;
            throw new InvalidOperationException($"필수 인자가 없습니다: {key}");
        }
        return new IntPtr(long.Parse(raw));
    }

    private static int ReadInt(Dictionary<string, string> values, string key) => int.Parse(values[key]);

    private static long ReadLong(Dictionary<string, string> values, string key, bool allowMissing = false)
    {
        if (!values.TryGetValue(key, out var raw))
        {
            if (allowMissing) return 0;
            throw new InvalidOperationException($"필수 인자가 없습니다: {key}");
        }
        return long.Parse(raw);
    }

    private static void WriteSuccess(object data)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine(JsonSerializer.Serialize(new { success = true, data }));
    }

    private static void WriteFailure(string message)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine(JsonSerializer.Serialize(new { success = false, message }));
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr FindWindowW(string lpClassName, string? lpWindowName);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr FindWindowExW(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string? lpszWindow);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeoutW(IntPtr hWnd, uint msg, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
}

