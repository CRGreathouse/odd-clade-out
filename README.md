# Odd Clade Out

Are you curious how animals are related to each other? Do you wish phylogenetics was more fun? I made a thing!

This is a phylogenetics quiz game where you identify which of three organisms is the evolutionary "odd one out" — the one least related to the other two.

## How to Play

Open `cladogame.html` directly in a browser. (For a single-file offline version, run `python3 build.py` first to generate `cladogame-bundle.html`, then open that file.)

### Gameplay

Each round presents three organisms. Your job is to pick the one that branched off earliest from the other two — the one that shares a more recent common ancestor with neither of its companions. After each answer, the game explains the correct phylogenetic relationship.

**Scoring:** Streak, correct answers, total played, and species seen are tracked in the score bar. You earn XP for each answer (+2 correct, −1 wrong) and new creatures unlock as your XP grows — starting with common species and gradually revealing rarer ones.

## Architecture

| File | Role |
|---|---|
| `cladogame.html` | Shell: layout, score bar, card grid, result panel |
| `phylogeny.js` | Data: ~92 internal nodes + 68 leaf species forming a complete phylogenetic tree from bacteria to mammals |
| `cladogame-logic.js` | Pure game logic: tree traversal, LCA computation, round selection |
| `cladogame-ui.js` | UI: rendering cards, handling clicks, animations |
| `cladogame.css` | Dark theme, responsive 3-column grid, keyframe animations |

### Core Algorithm

The "odd one out" is determined by Lowest Common Ancestor (LCA) age:

1. Given three organisms A, B, C, compute `lcaAge(A,B)`, `lcaAge(A,C)`, `lcaAge(B,C)`
2. The pair with the **newest** LCA (smallest age in millions of years) are the closest relatives
3. The remaining organism is the odd one out

`pickTriple()` guarantees each round is unambiguous — no ties allowed.

### Phylogenetic Tree

`phylogeny.js` contains a flat array of nodes. Each node has:

```js
{ id, parent, age_mya, label }                    // internal node
{ id, parent, age_mya, label,
  isLeaf: true, tier, commonName, funFact,
  image, emoji }                                   // leaf (species)
```

The tree spans from LUCA (~3800 Mya) through bacteria, archaea, fungi, plants, and animals, down to individual species like the common octopus, Nile crocodile, and baker's yeast.

## Adding New Species

1. Add a leaf node to `phylogeny.js` with a valid `parent` id, `isLeaf: true`, and a `tier` (1 = available from the start, higher tiers unlock with XP)
2. If needed, add a new parent node to contain it. (The pre-commit check will notify you of any polytomies, which you can correct or ignore.)
3. Add the organism's image to `images/{name}.png`

Image names are lowercase and hyphen-separated (e.g. `bald-eagle.png`, `giant-kelp.png`).

## Running Tests

`./pre-commit.sh` runs all tests in addition to `node validate.js`. You can also run them individually:

```
node tests/test-logic.js
node tests/test-tree.js
```

The test suite covers pure logic functions in `cladogame-logic.js` and the tree structure in `phylogeny.js`.
The validation script also checks for creatures without images, orphaned images, etc.
