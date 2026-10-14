// English and Spanish. The English text in the code and pages is itself the
// key, so anything without a translation simply stays in English.
//   tr("Stop signs")                         -> "Señales de alto" in Spanish
//   tr("{mph} mph in a {limit}", { mph, limit })
// A page's own text is translated when it loads (see apply).
const I18N = {
   dictionaries: {},
   lang: "en",
   languages: { en: "English", es: "Español" },

   add(lang, entries) {
      this.dictionaries[lang] = Object.assign(this.dictionaries[lang] || {}, entries);
   },

   // The same text however it was wrapped across lines
   key(text) {
      return String(text).replace(/\s+/g, " ").trim();
   },

   // Is there a translation for this text (in the current language)?
   has(text) {
      return this.lang != "en" && I18N.key(text) in (this.dictionaries[this.lang] || {});
   },

   tr(text, vars = null) {
      if (text == null) return "";
      const dict = this.dictionaries[this.lang];
      let out = (this.lang != "en" && dict && dict[I18N.key(text)]) || String(text);
      if (vars) {
         out = out.replace(/\{(\w+)\}/g, (match, name) => {
            if (!(name in vars)) return match;
            const value = vars[name];
            return typeof value == "string" ? I18N.tr(value) : String(value);
         });
      }
      return out;
   },

   // The language: ?lang=es in the link, then the saved choice, then the browser's
   init() {
      let lang = null;
      try {
         const fromLink = new URLSearchParams(location.search).get("lang");
         if (fromLink in this.languages) localStorage.setItem("lang", fromLink); // so the next page matches
         lang = fromLink || localStorage.getItem("lang");
      } catch (e) {}
      if (!lang && typeof navigator != "undefined") {
         lang = (navigator.language || "en").slice(0, 2);
      }
      this.lang = lang in this.languages ? lang : "en";
      if (typeof document != "undefined") {
         document.documentElement.lang = this.lang;
      }
   },

   setLang(lang) {
      try {
         localStorage.setItem("lang", lang);
      } catch (e) {}
      const url = new URL(location.href);
      url.searchParams.delete("lang");
      location.href = url.href; // reload in the new language
   },

   // Translate a page's own text: every piece of text, and every title,
   // aria-label and placeholder, that has a translation (text that scripts
   // add later goes through tr()). <p data-i18n="html"> translates the
   // whole paragraph, markup and all, for sentences split by links or bold.
   apply(root = document.body) {
      if (this.lang == "en" || !root) return;
      root.querySelectorAll("[data-i18n=html]").forEach((node) => {
         const el = /** @type {HTMLElement} */ (node);
         const key = I18N.key(el.innerHTML);
         if (I18N.has(key)) el.innerHTML = I18N.tr(key);
      });
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
         acceptNode: (node) => {
            const tag = node.parentElement && node.parentElement.tagName;
            return tag == "SCRIPT" || tag == "STYLE" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
         },
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
         const text = node.nodeValue;
         const key = I18N.key(text);
         if (!key || !I18N.has(key)) continue;
         const lead = text.match(/^\s*/)[0];
         const trail = text.match(/\s*$/)[0];
         node.nodeValue = lead + I18N.tr(key) + trail;
      }
      root.querySelectorAll("[title], [aria-label], [placeholder]").forEach((el) => {
         for (const name of ["title", "aria-label", "placeholder"]) {
            const value = el.getAttribute(name);
            if (value && I18N.has(value)) el.setAttribute(name, I18N.tr(value));
         }
      });
      const title = document.title;
      if (I18N.has(title)) document.title = I18N.tr(title);
   },

   // An English / Español switch in the top bar (after the links on wide
   // screens; next to the logo on phones, where the links scroll)
   addSwitch() {
      const bar = typeof document != "undefined" && document.querySelector(".topbar");
      if (!bar || bar.querySelector(".lang-switch")) return;
      const other = this.lang == "es" ? "en" : "es";
      const button = document.createElement("button");
      button.className = "lang-switch";
      button.textContent = other == "es" ? "🌐 Español" : "🌐 English";
      button.setAttribute("aria-label", other == "es" ? "Ver en español" : "View in English");
      button.addEventListener("click", () => I18N.setLang(other));
      bar.append(button);
   },
};

function tr(text, vars = null) {
   return I18N.tr(text, vars);
}

if (typeof document != "undefined") {
   I18N.init();
   document.addEventListener("DOMContentLoaded", () => {
      I18N.apply();
      I18N.addSwitch();
   });
}
