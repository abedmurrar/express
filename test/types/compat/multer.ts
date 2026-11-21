// A multer-style `req.file` and `req.files`, declared the way @types/multer
// declares them, with an upload middleware typed as express.RequestHandler.

import type { Buffer } from 'node:buffer'
import express, { type RequestHandler } from 'express'

declare global {
  namespace Express {
    namespace Multer {
      interface File {
        fieldname: string
        originalname: string
        encoding: string
        mimetype: string
        size: number
        destination: string
        filename: string
        path: string
        buffer: Buffer
      }
    }
    interface Request {
      file?: Multer.File | undefined
      files?: { [fieldname: string]: Multer.File[] } | Multer.File[] | undefined
    }
  }
}

declare const upload: {
  single(field: string): RequestHandler
  array(field: string, maxCount?: number): RequestHandler
}

const app = express()
app.post('/profile', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).send('no file')
  return res.json({ name: req.file.originalname, size: req.file.size })
})
app.post('/photos', upload.array('photos', 12), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : []
  res.json(files.map((file) => file.filename))
})
