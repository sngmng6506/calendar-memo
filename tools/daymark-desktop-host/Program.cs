using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;

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
                case "dump":
                    DumpWindows();
                    return 0;
                case "children":
                    DumpProgmanChildren();
                    return 0;
                case "interact":
                    Interact(args);
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
            workerClass = ClassName(worker),
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
        WriteSuccess(new { worker = worker.ToInt64(), className = ClassName(worker) });
    }


    private static void DumpWindows()
    {
        var windows = new List<object>();
        EnumWindows((hwnd, _) =>
        {
            var className = ClassName(hwnd);
            if (className is "Progman" or "WorkerW" or "Shell_TrayWnd" or "XamlExplorerHostIslandWindow")
            {
                windows.Add(new
                {
                    hwnd = hwnd.ToInt64(),
                    className,
                    hasDefView = FindDescendantByClass(hwnd, "SHELLDLL_DefView") != IntPtr.Zero,
                    hasSysListView = FindDescendantByClass(hwnd, "SysListView32") != IntPtr.Zero,
                    parent = GetParent(hwnd).ToInt64()
                });
            }
            return true;
        }, IntPtr.Zero);
        WriteSuccess(new { windows });
    }

    // ---- Desktop input bridge -------------------------------------------------
    // A wallpaper-attached window sits below SHELLDLL_DefView, so the shell's icon
    // layer swallows every click. This hook watches mouse input over the desktop and
    // forwards it to the attached window whenever the cursor is NOT over an icon,
    // which keeps icons behaving normally while empty desktop space drives the app.
    private const int WhMouseLl = 14;
    private const uint WmMouseMove = 0x0200;
    private const uint WmLButtonDown = 0x0201;
    private const uint WmLButtonUp = 0x0202;
    private const uint WmRButtonDown = 0x0204;
    private const uint WmRButtonUp = 0x0205;
    private const uint WmMouseWheel = 0x020A;
    private const uint LvmHitTest = 0x1000 + 18;

    private static IntPtr targetWindow = IntPtr.Zero;
    private static IntPtr hookHandle = IntPtr.Zero;
    private static LowLevelMouseProc? hookProc;

    private static void Interact(string[] args)
    {
        var values = ParseArgs(args);
        targetWindow = ReadHandle(values, "hwnd");
        if (targetWindow == IntPtr.Zero || !IsWindow(targetWindow))
        {
            WriteFailure("전달 대상 창을 찾지 못했습니다.");
            return;
        }

        hookProc = MouseHook;
        hookHandle = SetWindowsHookExW(WhMouseLl, hookProc, IntPtr.Zero, 0);
        if (hookHandle == IntPtr.Zero)
        {
            WriteFailure("마우스 훅을 설치하지 못했습니다.");
            return;
        }

        WriteSuccess(new { hooked = true, target = targetWindow.ToInt64() });
        Console.Out.Flush();

        // Pump messages so the low-level hook keeps receiving events.
        while (GetMessageW(out var msg, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }

        UnhookWindowsHookEx(hookHandle);
    }

    private static IntPtr MouseHook(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code < 0) return CallNextHookEx(hookHandle, code, wParam, lParam);

        var message = (uint)wParam.ToInt64();
        if (!ShouldForward(message))
        {
            return CallNextHookEx(hookHandle, code, wParam, lParam);
        }

        var data = Marshal.PtrToStructure<MsllHookStruct>(lParam);
        var point = data.pt;

        if (!IsWindow(targetWindow) || !OverDesktopSurface(point) || OverDesktopIcon(point))
        {
            return CallNextHookEx(hookHandle, code, wParam, lParam);
        }

        ForwardToTarget(message, point, data.mouseData);

        // Movement is forwarded but never swallowed: the cursor must keep moving
        // normally so the user can still reach icons.
        if (message == WmMouseMove) return CallNextHookEx(hookHandle, code, wParam, lParam);

        // Clicks on empty desktop belong to the app; swallow them so the shell does
        // not also start a rubber-band selection on top of it.
        return new IntPtr(1);
    }

    private static bool ShouldForward(uint message) =>
        message is WmMouseMove or WmLButtonDown or WmLButtonUp or WmRButtonDown or WmRButtonUp or WmMouseWheel;

    private static bool OverDesktopSurface(Point point)
    {
        var hit = WindowFromPoint(point);
        if (hit == IntPtr.Zero) return false;
        var name = ClassName(hit);
        // Anything else on top (a normal app window) means the desktop is covered.
        return name is "SysListView32" or "SHELLDLL_DefView" or "Progman" or "WorkerW";
    }

    // Ask the shell's list view whether an icon occupies this point. The struct has
    // to live in explorer's address space because LVM_HITTEST takes a pointer.
    private static bool OverDesktopIcon(Point point)
    {
        var listView = DesktopListView();
        if (listView == IntPtr.Zero) return false;

        var client = point;
        if (!ScreenToClient(listView, ref client)) return false;

        GetWindowThreadProcessId(listView, out var pid);
        if (pid == 0) return false;

        var process = OpenProcess(ProcessVmOperation | ProcessVmRead | ProcessVmWrite, false, pid);
        if (process == IntPtr.Zero) return false;

        var remote = IntPtr.Zero;
        try
        {
            var size = Marshal.SizeOf<LvHitTestInfo>();
            remote = VirtualAllocEx(process, IntPtr.Zero, (uint)size, MemCommit | MemReserve, PageReadWrite);
            if (remote == IntPtr.Zero) return false;

            var info = new LvHitTestInfo { pt = client };
            var local = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.StructureToPtr(info, local, false);
                if (!WriteProcessMemory(process, remote, local, (uint)size, out _)) return false;
            }
            finally
            {
                Marshal.FreeHGlobal(local);
            }

            var index = SendMessageW(listView, LvmHitTest, IntPtr.Zero, remote).ToInt64();
            return index >= 0;
        }
        catch
        {
            return false;
        }
        finally
        {
            if (remote != IntPtr.Zero) VirtualFreeEx(process, remote, 0, MemRelease);
            CloseHandle(process);
        }
    }

    private static IntPtr cachedListView = IntPtr.Zero;

    private static IntPtr DesktopListView()
    {
        if (cachedListView != IntPtr.Zero && IsWindow(cachedListView)) return cachedListView;

        var progman = FindWindowW("Progman", null);
        if (progman == IntPtr.Zero) progman = GetShellWindow();
        var defView = FindWindowExW(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
        if (defView == IntPtr.Zero)
        {
            // Win10 keeps the icon view inside a WorkerW instead of Progman.
            EnumWindows((hwnd, _) =>
            {
                var candidate = FindWindowExW(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null);
                if (candidate != IntPtr.Zero)
                {
                    defView = candidate;
                    return false;
                }
                return true;
            }, IntPtr.Zero);
        }
        if (defView == IntPtr.Zero) return IntPtr.Zero;

        cachedListView = FindWindowExW(defView, IntPtr.Zero, "SysListView32", null);
        return cachedListView;
    }

    private static void ForwardToTarget(uint message, Point screenPoint, uint mouseData)
    {
        var client = screenPoint;
        if (message != WmMouseWheel && !ScreenToClient(targetWindow, ref client)) return;

        // The wheel message keeps screen coordinates; everything else uses client space.
        var lParam = message == WmMouseWheel
            ? MakeLParam(screenPoint.X, screenPoint.Y)
            : MakeLParam(client.X, client.Y);

        var wParam = message switch
        {
            WmLButtonDown or WmLButtonUp => new IntPtr(0x0001),
            WmRButtonDown or WmRButtonUp => new IntPtr(0x0002),
            WmMouseWheel => new IntPtr((int)(mouseData & 0xFFFF0000)),
            _ => IntPtr.Zero
        };

        PostMessageW(targetWindow, message, wParam, lParam);
    }

    private static IntPtr MakeLParam(int x, int y) => new IntPtr((y << 16) | (x & 0xFFFF));

    private static void DumpProgmanChildren()
    {
        var progman = FindWindowW("Progman", null);
        if (progman == IntPtr.Zero) progman = GetShellWindow();
        foreach (var pair in new[] { (UIntPtr.Zero, IntPtr.Zero), ((UIntPtr)0xD, IntPtr.Zero) })
        {
            SendMessageTimeoutW(progman, SpawnWorkerW, pair.Item1, pair.Item2, SmtoNormal, 1000, out _);
            Thread.Sleep(80);
        }
        var kids = new List<object>();
        EnumChildWindows(progman, (hwnd, _) =>
        {
            GetWindowRect(hwnd, out var r);
            kids.Add(new
            {
                hwnd = hwnd.ToInt64(),
                className = ClassName(hwnd),
                parent = GetParent(hwnd).ToInt64(),
                isDirectChild = GetParent(hwnd) == progman,
                hasDefView = FindWindowExW(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero,
                rect = new { r.Left, r.Top, r.Right, r.Bottom }
            });
            return true;
        }, IntPtr.Zero);
        WriteSuccess(new { progman = progman.ToInt64(), children = kids });
    }

    private static IntPtr FindWorkerWBehindIcons()
    {
        var progman = FindWindowW("Progman", null);
        if (progman == IntPtr.Zero) progman = GetShellWindow();
        if (progman == IntPtr.Zero) progman = GetDesktopWindow();
        if (progman == IntPtr.Zero) return IntPtr.Zero;

        // Ask the shell to spawn the wallpaper WorkerW that sits behind the desktop icons.
        foreach (var pair in new[] { (UIntPtr.Zero, IntPtr.Zero), ((UIntPtr)0xD, IntPtr.Zero), ((UIntPtr)0xD, new IntPtr(1)) })
        {
            SendMessageTimeoutW(progman, SpawnWorkerW, pair.Item1, pair.Item2, SmtoNormal, 1000, out _);
            Thread.Sleep(80);
        }

        // Win11 layout: the icons (SHELLDLL_DefView) and the wallpaper (WorkerW)
        // are both CHILDREN of Progman. The wallpaper WorkerW sits below the icons,
        // so hosting our window inside it puts us above the wallpaper and behind
        // the icons. Note this WorkerW is NOT a top-level window - enumerating
        // top-level windows only finds small unrelated WorkerW windows.
        var wallpaper = FindFullScreenWorkerWChild(progman);
        if (wallpaper != IntPtr.Zero) return wallpaper;

        // Win10 layout: icons live in a top-level WorkerW and the wallpaper WorkerW
        // is that window's next sibling (the one with no DefView of its own).
        var iconHost = IntPtr.Zero;
        EnumWindows((hwnd, _) =>
        {
            if (FindWindowExW(hwnd, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero)
            {
                iconHost = hwnd;
                return false;
            }
            return true;
        }, IntPtr.Zero);

        if (iconHost != IntPtr.Zero && ClassName(iconHost) == "WorkerW")
        {
            var sibling = FindWindowExW(IntPtr.Zero, iconHost, "WorkerW", null);
            if (sibling != IntPtr.Zero && FindWindowExW(sibling, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
            {
                return sibling;
            }
        }

        // Last resort: Progman itself. Never fall back to a stray top-level WorkerW -
        // those are tiny helper windows and would clip the attached window away.
        return progman;
    }

    // The wallpaper host is a WorkerW child of Progman that spans the whole desktop
    // and does not carry the icon view itself.
    private static IntPtr FindFullScreenWorkerWChild(IntPtr progman)
    {
        if (progman == IntPtr.Zero) return IntPtr.Zero;

        // Progman's own rect is unreliable (often 0x0), so size the candidate against
        // the desktop window instead and simply take the largest WorkerW child.
        GetWindowRect(GetDesktopWindow(), out var deskRect);
        var deskArea = Math.Max(0, deskRect.Right - deskRect.Left) * (long)Math.Max(0, deskRect.Bottom - deskRect.Top);

        var best = IntPtr.Zero;
        var bestArea = 0L;
        var child = IntPtr.Zero;
        while ((child = FindWindowExW(progman, child, "WorkerW", null)) != IntPtr.Zero)
        {
            if (FindWindowExW(child, IntPtr.Zero, "SHELLDLL_DefView", null) != IntPtr.Zero) continue;
            if (!GetWindowRect(child, out var rect)) continue;
            var area = Math.Max(0, rect.Right - rect.Left) * (long)Math.Max(0, rect.Bottom - rect.Top);
            if (area <= 0) continue;
            // Skip tiny helper windows when we know how big the desktop is.
            if (deskArea > 0 && area * 2 < deskArea) continue;
            if (area > bestArea)
            {
                bestArea = area;
                best = child;
            }
        }
        return best;
    }

    private static IntPtr FindDescendantByClass(IntPtr parent, string className)
    {
        var found = IntPtr.Zero;
        EnumChildWindows(parent, (hwnd, _) =>
        {
            if (ClassName(hwnd) == className)
            {
                found = hwnd;
                return false;
            }

            found = FindDescendantByClass(hwnd, className);
            return found == IntPtr.Zero;
        }, IntPtr.Zero);
        return found;
    }

    private static string ClassName(IntPtr hwnd)
    {
        var buffer = new System.Text.StringBuilder(256);
        GetClassNameW(hwnd, buffer, buffer.Capacity);
        return buffer.ToString();
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
    private delegate bool EnumChildProc(IntPtr hwnd, IntPtr lParam);
    private delegate IntPtr LowLevelMouseProc(int code, IntPtr wParam, IntPtr lParam);

    private const uint ProcessVmOperation = 0x0008;
    private const uint ProcessVmRead = 0x0010;
    private const uint ProcessVmWrite = 0x0020;
    private const uint MemCommit = 0x1000;
    private const uint MemReserve = 0x2000;
    private const uint MemRelease = 0x8000;
    private const uint PageReadWrite = 0x04;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MsllHookStruct
    {
        public Point pt;
        public uint mouseData;
        public uint flags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct LvHitTestInfo
    {
        public Point pt;
        public uint flags;
        public int iItem;
        public int iSubItem;
        public int iGroup;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public Point pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr FindWindowW(string lpClassName, string? lpWindowName);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetShellWindow();
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr FindWindowExW(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string? lpszWindow);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildProc lpEnumFunc, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetClassNameW(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SendMessageTimeoutW(IntPtr hWnd, uint msg, UIntPtr wParam, IntPtr lParam, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool IsWindow(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetParent(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)] private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr SetWindowsHookExW(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern int GetMessageW(out Msg lpMsg, IntPtr hWnd, uint min, uint max);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool TranslateMessage(ref Msg lpMsg);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr DispatchMessageW(ref Msg lpMsg);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ScreenToClient(IntPtr hWnd, ref Point point);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern bool PostMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr SendMessageW(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, uint size, uint type, uint protect);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool VirtualFreeEx(IntPtr process, IntPtr address, uint size, uint type);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool WriteProcessMemory(IntPtr process, IntPtr address, IntPtr buffer, uint size, out IntPtr written);
}

