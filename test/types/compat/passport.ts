// A passport-style `req.user`, declared the way @types/passport declares it:
// open interfaces in the global Express namespace, then an app's own User.

import express, { type NextFunction, type Request, type Response } from 'express'

declare global {
  namespace Express {
    interface AuthInfo {}
    interface User {
      id: string
      email: string
    }
    interface Request {
      authInfo?: AuthInfo | undefined
      user?: User | undefined
      login(user: User, done: (err: any) => void): void
      logout(done: (err: any) => void): void
      isAuthenticated(): this is AuthenticatedRequest
      isUnauthenticated(): this is UnauthenticatedRequest
    }
    interface AuthenticatedRequest extends Request {
      user: User
    }
    interface UnauthenticatedRequest extends Request {
      user?: undefined
    }
  }
}

function ensureLoggedIn(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next()
  res.redirect('/login')
}

const app = express()
app.get('/profile', ensureLoggedIn, (req, res) => {
  if (req.user) res.json({ id: req.user.id, email: req.user.email })
})
app.post('/login', (req, res, next) => {
  req.login({ id: '1', email: 'tobi@example.com' }, (err) => {
    if (err) return next(err)
    res.redirect('/profile')
  })
})
app.post('/logout', (req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.logout((err) => (err ? next(err) : res.redirect('/')))
})
