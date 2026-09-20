# Third-party notices

This project is MIT licensed (see `LICENSE`). It bundles the following
third-party library, which remains under its own license.

## three.js

- Version: r180 (`three@0.180.0`)
- Upstream: <https://github.com/mrdoob/three.js>
- Vendored files: `public/vendor/three.module.min.js` and `public/vendor/three.core.min.js`
- License: MIT — Copyright 2010-2025 Three.js Authors

The MIT license banner is retained at the top of both vendored files.

### Updating

The library is vendored (committed into `public/vendor/`) rather than installed
from npm or a CDN, so it works offline with no build step. To update it, replace
both files with the same version from the upstream `build/` directory — the
module build imports its `three.core.min.js` sibling, so the pair must match:

```powershell
$version = (Invoke-RestMethod https://registry.npmjs.org/three/latest).version
Invoke-WebRequest "https://unpkg.com/three@$version/build/three.module.min.js" -OutFile public/vendor/three.module.min.js
Invoke-WebRequest "https://unpkg.com/three@$version/build/three.core.min.js" -OutFile public/vendor/three.core.min.js
```

### License text

```
Copyright 2010-2025 Three.js Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
