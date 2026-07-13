const setupStatus = document.querySelector("#setupStatus");
const signedOutHelp = document.querySelector("#signedOutHelp");
const tokenPanel = document.querySelector("#tokenPanel");
const userLabel = document.querySelector("#userLabel");
const issueToken = document.querySelector("#issueToken");
const tokenField = document.querySelector("#tokenField");
const tokenValue = document.querySelector("#tokenValue");
const copyToken = document.querySelector("#copyToken");

init();

async function init() {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) throw new Error("로그인 상태를 확인하지 못했습니다.");
    const data = await res.json();
    if (!data.user) {
      setupStatus.textContent = "Google 로그인이 필요합니다.";
      signedOutHelp.hidden = false;
      return;
    }
    setupStatus.textContent = "연결할 계정이 확인되었습니다.";
    tokenPanel.hidden = false;
    userLabel.textContent = data.user.email || data.user.name || "로그인된 사용자";
  } catch (error) {
    setupStatus.textContent = error.message;
  }
}

issueToken.addEventListener("click", async () => {
  issueToken.disabled = true;
  setupStatus.textContent = "토큰을 발급하고 있습니다.";
  try {
    const res = await fetch("/api/widget/token", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token) throw new Error(data.error || "토큰 발급에 실패했습니다.");
    tokenValue.value = data.token;
    tokenField.hidden = false;
    copyToken.hidden = false;
    setupStatus.textContent = "발급 완료. 토큰은 다시 표시되지 않으므로 지금 복사하세요.";
  } catch (error) {
    setupStatus.textContent = error.message;
  } finally {
    issueToken.disabled = false;
  }
});

copyToken.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(tokenValue.value);
    setupStatus.textContent = "토큰을 복사했습니다.";
  } catch {
    tokenValue.select();
    document.execCommand("copy");
    setupStatus.textContent = "토큰을 복사했습니다.";
  }
});
