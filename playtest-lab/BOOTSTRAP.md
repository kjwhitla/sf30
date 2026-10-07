# Runnable Playtest Lab Bootstrap

The current GitHub connector cannot perform a normal filesystem `git push` of the complete local playtest-lab working tree.

To keep GitHub as the handoff point, this branch includes the runnable source bundle at:

`playtest-lab/bootstrap/strikeforce30-core.tgz`

From the repository root run:

```bash
git checkout playtest-lab-v0.2
git pull origin playtest-lab-v0.2
bash playtest-lab/bootstrap.sh
cd playtest-lab
npm install
npm test
npm run smoke:synthetic
```

The bootstrap expands the actual TypeScript engine, scripts, and tests directly into `playtest-lab/`.

This is an interim synchronization mechanism until the full source tree is committed normally to the repository.
