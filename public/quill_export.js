// Quill recipe export for KubeJS 6 (Minecraft 1.20.1).
// 1. Put this file in <instance>/kubejs/server_scripts/
// 2. Start a world (or run /reload)
// 3. Upload <instance>/kubejs/exported/quill.json to Quill
// This captures recipes after the pack's own KubeJS edits, including ones mods register in code.
// Delete the file afterwards; it rewrites quill.json on every reload.

ServerEvents.recipes(event => {
  const recipes = []
  event.forEachRecipe({}, recipe => {
    try {
      recipes.push({ id: String(recipe.getId()), json: JSON.parse(String(recipe.json)) })
    } catch (e) {
      // recipes that don't serialize are skipped
    }
  })
  const items = Ingredient.all.itemIds.map(id => String(id))
  JsonIO.write('kubejs/exported/quill.json', { recipes: recipes, items: items })
  console.info(`Quill: exported ${recipes.length} recipes and ${items.length} items`)
})
