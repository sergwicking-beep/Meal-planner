import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const recipes = JSON.parse(
  readFileSync(join(__dirname, "../recipes.json"), "utf8")
);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { selectedIds = [] } = req.body;

  // De-duplicate and cap at 7 — the user's picks always make the cut
  const uniqueSelected = [];
  const seen = new Set();
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe) continue;
    seen.add(id);
    uniqueSelected.push(recipe);
    if (uniqueSelected.length === 7) break;
  }

  // Fill the remaining slots with a fresh random shuffle of the rest of the
  // book — this is genuine randomness (not an LLM guessing at "random"), so
  // every regeneration produces a different spread of meals.
  const pool = shuffled(recipes.filter((r) => !seen.has(r.id)));

  const chosen = [...uniqueSelected];
  for (const recipe of pool) {
    if (chosen.length >= 7) break;
    chosen.push(recipe);
  }
  // Only fall back to repeats if the recipe book itself has fewer than 7 meals
  while (chosen.length < 7 && recipes.length > 0) {
    chosen.push(recipes[Math.floor(Math.random() * recipes.length)]);
  }

  const arranged = shuffled(chosen);
  const plan = DAYS.map((day, i) => ({ day, recipe: arranged[i] }));

  return res.status(200).json({ plan });
}
