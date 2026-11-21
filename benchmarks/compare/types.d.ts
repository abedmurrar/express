// express-original is express@5.3.0 installed under an npm alias, so it has
// the same types as `express`.
declare module 'express-original' {
  import express = require('express')
  export = express
}
