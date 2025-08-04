// Hooks à surveiller pour D&D5
const SUPPORTED_SHEETS = [
  'renderJournalSheet',
  'renderJournalEntryPageSheet',
  'renderActorSheet',
  'renderItemSheet'
];

// Détecte le texte à traduire selon le type de document
function getTranslatableContent(app) {
  const doc = app.document;
  // Journal classique
  if (doc?.content) return doc.content;
  // Nouvelle page de journal
  if (doc?.text) return doc.text;
  // Pour D&D5 Actor
  if (doc?.system?.details?.biography?.value) return doc.system.details.biography.value;
  // Pour D&D5 Item (sorts, objets...)
  if (doc?.system?.description?.value) return doc.system.description.value;
  // Si rien de trouvé
  return null;
}

// Crée la copie traduite selon le type
async function createTranslatedCopy(app, translated, targetLang) {
  const doc = app.document;
  // Journal d'ancienne génération
  if (doc instanceof JournalEntry) {
    return JournalEntry.create({
      name: `${doc.name} (${targetLang.toUpperCase()})`,
      content: translated,
      folder: doc.folder?.id || null,
      flags: {
        "autotranslate-journal": {
          translatedFrom: doc.id,
          targetLang: targetLang.toUpperCase(),
          date: new Date().toISOString()
        }
      }
    });
  }
  // Nouvelle page de Journal
  if (doc.constructor.name === "JournalEntryPage") {
    // Crée une nouvelle page dans le même journal
    return doc.parent.createEmbeddedDocuments("JournalEntryPage", [{
      name: `${doc.name} (${targetLang.toUpperCase()})`,
      type: doc.type,
      text: translated,
      flags: {
        "autotranslate-journal": {
          translatedFrom: doc.id,
          targetLang: targetLang.toUpperCase(),
          date: new Date().toISOString()
        }
      }
    }]);
  }
  // Acteur D&D5
  if (doc instanceof Actor) {
    let system = foundry.utils.duplicate(doc.system);
    if (system.details && system.details.biography) system.details.biography.value = translated;
    return Actor.create({
      name: `${doc.name} (${targetLang.toUpperCase()})`,
      type: doc.type,
      system,
      folder: doc.folder?.id || null,
      flags: {
        "autotranslate-journal": {
          translatedFrom: doc.id,
          targetLang: targetLang.toUpperCase(),
          date: new Date().toISOString()
        }
      }
    });
  }
  // Objet D&D5 (sorts, items...)
  if (doc instanceof Item) {
    let system = foundry.utils.duplicate(doc.system);
    if (system.description) system.description.value = translated;
    return Item.create({
      name: `${doc.name} (${targetLang.toUpperCase()})`,
      type: doc.type,
      system,
      folder: doc.folder?.id || null,
      flags: {
        "autotranslate-journal": {
          translatedFrom: doc.id,
          targetLang: targetLang.toUpperCase(),
          date: new Date().toISOString()
        }
      }
    });
  }
  // Sinon, rien
  return null;
}

// Ajoute le bouton universel
function addUniversalTranslateButton(app, html) {
  const $header = html.closest('.app').find('.header-buttons');
  if ($header.find('.autotranslate-journal').length) return;
  const btn = $(`<a class="autotranslate-journal" title="Créer une copie traduite"><i class="fas fa-language"></i> Traduire</a>`);
  btn.click(async () => {
    const apiKey = game.settings.get("autotranslate-journal", "deeplApiKey");
    const targetLang = game.settings.get("autotranslate-journal", "targetLang");
    if (!apiKey) return ui.notifications.error("Clé API DeepL non renseignée !");
    const content = getTranslatableContent(app);
    if (!content) return ui.notifications.error("Aucun contenu détecté pour la traduction.");
    ui.notifications.info("Traduction en cours…");
    try {
      const translated = await translateWithDeepL(content, targetLang, apiKey);
      const entry = await createTranslatedCopy(app, translated, targetLang);
      if (entry && entry.sheet) entry.sheet.render(true);
      ui.notifications.info("Copie traduite créée !");
    } catch (err) {
      ui.notifications.error("Erreur de traduction : " + err.message);
    }
  });
  $header.prepend(btn);
}

// Active le bouton sur tous les types de fiches concernés
for (let hook of SUPPORTED_SHEETS) {
  Hooks.on(hook, addUniversalTranslateButton);
}

// Fonction DeepL (inchangée)
async function translateWithDeepL(text, targetLang, apiKey) {
  const url = "https://api-free.deepl.com/v2/translate";
  const params = new URLSearchParams({
    auth_key: apiKey,
    text: text,
    target_lang: targetLang.toUpperCase()
  });
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  if (resp.status === 429) throw new Error("Limite d'utilisation API atteinte (erreur 429).");
  if (!resp.ok) throw new Error(`Erreur DeepL : ${resp.statusText} (${resp.status})`);
  const json = await resp.json();
  if (!json.translations || !json.translations[0]) throw new Error("Réponse DeepL inattendue.");
  return json.translations[0].text;
}
