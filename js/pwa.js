// Installable app: registers the service worker (offline support) and
// shows any element with data-install as an "Install app" button when the
// browser offers installation.
(() => {
   if ("serviceWorker" in navigator && location.protocol != "file:") {
      window.addEventListener("load", () => {
         navigator.serviceWorker.register("sw.js").catch(() => {
            // not supported here (e.g. a private window): the app still works online
         });
      });
   }

   const showInstallButtons = (show) => {
      /** @type {NodeListOf<HTMLElement>} */
      const buttons = document.querySelectorAll("[data-install]");
      buttons.forEach((el) => (el.hidden = !show));
   };

   let installPrompt = null;
   window.addEventListener("beforeinstallprompt", (evt) => {
      evt.preventDefault();
      installPrompt = evt;
      showInstallButtons(true);
   });
   window.addEventListener("appinstalled", () => {
      showInstallButtons(false);
   });
   document.addEventListener("click", (evt) => {
      const button = evt.target instanceof Element && evt.target.closest("[data-install]");
      if (button && installPrompt) {
         installPrompt.prompt();
         installPrompt = null;
      }
   });
})();
