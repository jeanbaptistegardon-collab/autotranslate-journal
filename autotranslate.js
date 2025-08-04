Hooks.once('init', () => {
  game.settings.register("autotranslate-journal", "deeplApiKey", {
    name: "Clé API DeepL",
    hint: "d2481ce6-3c69-46dd-b212-114c4e014a01:fx",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });
  game.settings.register("autotranslate-journal", "targetLang", {
    name: "Langue cible",
    hint: "Langue de traduction (ex. FR, EN, ES…)",
    scope: "world",
    config: true,
    type: String,
    default: "FR"
  });
});

Hooks.on('renderJournalSheet', (app, html) => {
  const btn = $(`<a class="autotranslate-journal" title="Créer une copie traduite"><i class="fas fa-language"></i> Traduire</a>`);
  btn.click(async () => {
    const apiKey = game.settings.get("autotranslate-journal", "deeplApiKey");
    const targetLang = game.settings.get("autotranslate-journal", "targetLang");
    if (!apiKey) return ui.notifications.error("Clé API DeepL non renseignée !");
    const content = app.document?.content ?? app.document?.data?.content;
    ui.notifications.info("Traduction en cours…");
    try {
      const translated = await translateWithDeepL(content, targetLang, apiKey);
      const entry = await JournalEntry.create({
        name: `${app.document.name || "Journal"} (${targetLang.toUpperCase()})`,
        content: translated,
        folder: app.document.folder?.id || null,
        flags: { "autotranslate-journal": true }
      });
      ui.notifications.info("Copie traduite créée !");
      // Ouvre automatiquement le journal traduit
      entry.sheet?.render(true);
    } catch (err) {
      ui.notifications.error("Erreur de traduction : " + err.message);
    }
  });
  html.closest('.app').find('.header-buttons').prepend(btn);
});

async function translateWithDeepL(text, targetLang, apiKey) {
  const url = "https://api-free.deepl.com/v2/translate";
  const params = new URLSearchParams({ auth_key: apiKey, text: text, target_lang: targetLang.toUpperCase() });
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  if (!resp.ok) throw new Error(resp.statusText);
  const json = await resp.json();
  if (!json.translations || !json.translations[0]) throw new Error("Réponse DeepL inattendue.");
  return json.translations[0].text;
}
