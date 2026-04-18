import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const recipes = JSON.parse(
  readFileSync(join(__dirname, "../recipes.json"), "utf8")
);

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { selectedIds = [] } = req.body;

  const selectedRecipes = recipes.filter((r) => selectedIds.includes(r.id));
  const unselectedRecipes = recipes.filter((r) => !selectedIds.includes(r.id));

  const recipeList = recipes
    .map((r) => `ID: ${r.id}, Name: ${r.name}, Category: ${r.category}`)
    .join("\n");

  const preSelected = selectedRecipes
    .map((r) => `ID: ${r.id}, Name: ${r.name}`)
    .join("\n");

  const prompt = `You are a meal planner. Given the recipes below, create a 7-day dinner plan (Monday–Sunday).

Available recipes:
${recipeList}

The user has already selected these meals to include:
${preSelected || "None — choose all 7 freely"}

Rules:
- Use each of the user's selected meals exactly once, placed on any day
- Fill remaining days from the available recipes to reach 7 total
- Aim for variety: mix categories, avoid repeating the same protein two days in a row
- You may use a recipe more than once only if there are fewer than 7 recipes total

Respond with ONLY valid JSON in this exact format, no other text. Use only the recipe IDs listed above — do not invent new IDs:
{
  "plan": [
    { "day": "Monday", "recipeId": "<id from list above>" },
    { "day": "Tuesday", "recipeId": "<id from list above>" },
    { "day": "Wednesday", "recipeId": "<id from list above>" },
    { "day": "Thursday", "recipeId": "<id from list above>" },
    { "day": "Friday", "recipeId": "<id from list above>" },
    { "day": "Saturday", "recipeId": "<id from list above>" },
    { "day": "Sunday", "recipeId": "<id from list above>" }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].text.trim().replace(/^```json\s*|^```\s*|```$/gm, '').trim();
    const parsed = JSON.parse(text);

    const validIds = recipes.map((r) => r.id);

    // Attach full recipe objects; if Claude returns a bad ID, cycle through valid recipes
    const enriched = parsed.plan.map((entry, i) => {
      const recipe =
        recipes.find((r) => r.id === entry.recipeId) ||
        recipes[i % recipes.length];
      return { day: entry.day, recipe };
    });

    return res.status(200).json({ plan: enriched });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Failed to generate plan" });
  }
}
