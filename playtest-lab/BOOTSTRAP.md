# Verified runnable playtest payload

The runnable Strikeforce30 headless engine is transported on this branch as 35 small text chunks because the current GitHub connector cannot perform a normal filesystem git push from the build container.

`bootstrap.sh` will not extract anything unless the reconstructed payload matches both:

- byte size: `78,445`
- SHA-256: `bc229b86057aa3f52a879dbc6fd67b4025228a0de498612290e9c7750785e69b`

Run from the repository root:

```bash
git checkout playtest-lab-v0.2
git pull origin playtest-lab-v0.2
bash playtest-lab/bootstrap.sh
cd playtest-lab
npm install
npm test
npm run smoke:synthetic
```

The bootstrap reconstructs normal `src/`, `test/`, `scripts/`, `package.json`, and `tsconfig.json` files in your checkout.

This runs the **headless rules/playtest engine**. It is not yet the clickable browser battlefield.
