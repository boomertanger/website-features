# website-features

Code for custom web features embedded into the Squarespace site via Code Blocks,
using Memberspace for membership/auth and Firebase for the backend.

## Structure
- `/shared/` — code shared across features (Firebase init, Memberspace helpers)
- `/features/<feature-name>/` — one folder per feature. Copy `/features/_template` to start a new one.
- `CHANGELOG.md` — one entry per tagged release

## Branches & environments
- `main` — production-ready code
- `dev` — active work-in-progress; this is what the **hidden staging page** loads
- Tag a release (`git tag v1.0.0 && git push --tags`) once a feature is verified on
  staging and ready to go live — the **production page** loads a pinned tag, never a branch

## Loading a feature into Squarespace

Because these files use ES module `import`, the Squarespace code block needs `type="module"`.

**Staging (hidden page):**
```html
<script type="module" src="https://cdn.jsdelivr.net/gh/<user>/<repo>@dev/features/<feature-name>/feature.js"></script>
```

**Production (live page), once tagged:**
```html
<script type="module" src="https://cdn.jsdelivr.net/gh/<user>/<repo>@v1.0.0/features/<feature-name>/feature.js"></script>
```

jsDelivr caches branch URLs for ~10 minutes and tag URLs indefinitely per version —
that's why production always points at a tag, never `@main` or `@dev`.

## Adding a new feature
1. Copy `/features/_template` to `/features/<feature-name>`
2. Fill in `<feature-name>/README.md` with the spec
3. Write `<feature-name>/feature.js`
4. Test via the staging script tag above
5. Tag a release and flip the production script tag to that tag

## Releasing a version (promoting dev → production)
1. Merge dev into main — main should always reflect exactly what's tested
   and working, never be stale.
2. If the release touches shared/firebase-init.js, flip its ENV constant
   to "production" only on main. dev should always stay set to "staging".
3. Commit that ENV flip directly on main.
4. Tag the release from main (e.g. git tag v1.1.0) and push the tag.
5. Update the production Squarespace code block(s) to point at the new tag.
