(function () {
  try {
    var raw = localStorage.getItem("fs_admin_session_v1");
    if (!raw) return;
    var session = JSON.parse(raw);
    if (
      session &&
      session.access_token &&
      (!session.expires_at || Number(session.expires_at) > Date.now() - 5000)
    ) {
      document.documentElement.classList.add("admin-has-session");
    }
  } catch (error) {
    /* sessão inválida: permanece na tela de login */
  }
})();
