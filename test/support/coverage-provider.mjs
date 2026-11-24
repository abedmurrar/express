// @vitest/coverage-v8, reading the files Node ran instead of Vite's copy.
//
// The tests require() lib/ natively, so V8's offsets are offsets in the files
// on disk. The stock provider applies them to the file after Vite's transform,
// which adds `;` after statements and blanks comments, so every count after
// the first change is read from the wrong place: 94.3% of branches where the
// files on disk give 99.8%. It already reads the disk for child processes
// (`isTransformedByVite` is false for them), and this does the same for all.

import v8 from '@vitest/coverage-v8'
import { V8CoverageProvider } from '@vitest/coverage-v8/dist/provider.js'

class Provider extends V8CoverageProvider {
  transformFile(url, project, environment) {
    return super.transformFile(url, project, environment, false)
  }
}

export default {
  ...v8,
  getProvider() {
    return new Provider()
  }
}
