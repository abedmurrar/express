# Releasing

Publishing to npm needs a go-ahead first (see "Later, with your go-ahead" in ROADMAP.md). Until the package is renamed, the release workflow stops before publishing.

## One-time setup (before the first publish)

1. Rename the package in `package.json`, for example to `@abedmurrar/express`, the same pattern as the objection fork.
2. On npmjs.com, add a trusted publisher for the package: GitHub Actions, repository `abedmurrar/express`, workflow `release.yml`. That way, no npm token is stored as a secret.

## Each release

1. Make sure the `Unreleased (fork)` section of `History.md` describes the changes. The script refuses to release an empty one.
2. From an up-to-date `master` with a clean working tree:

   ```sh
   npm run release -- patch --dry-run   # shows the version and notes, changes nothing
   npm run release -- patch             # or minor, major, prerelease, or an exact version
   ```

   This runs lint and the tests, bumps the version, turns `Unreleased (fork)` into `<version> / <date>`, commits `Release v<version>` and tags `v<version>`. Nothing is pushed.
3. Push the commit and the tag:

   ```sh
   git push origin master --follow-tags
   ```

4. `.github/workflows/release.yml` runs CI on the tag, checks that the tag matches `package.json`, publishes with provenance (to the `next` dist-tag for prereleases, `latest` otherwise), and creates the GitHub release from that version's History.md section.

To undo before pushing: `git tag -d v<version> && git reset --hard HEAD~1`.

This flow is adapted from the objection fork's (`abedmurrar/objection.js`).
