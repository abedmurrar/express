'use strict'

/**
 * Module dependencies.
 */

var db = require('../../db')

exports.engine = 'ejs'

exports.before = function (req, res, next) {
  var id = req.params.pet_id
  // digits only: db.pets['__proto__'] is Array.prototype, which update would change
  var pet = /^\d+$/.test(id) ? db.pets[id] : undefined
  if (!pet) return next('route')
  req.pet = pet
  next()
}

exports.show = function (req, res, next) {
  res.render('show', { pet: req.pet })
}

exports.edit = function (req, res, next) {
  res.render('edit', { pet: req.pet })
}

exports.update = function (req, res, next) {
  var body = req.body
  req.pet.name = body.pet.name
  res.message('Information updated!')
  res.redirect('/pet/' + req.pet.id)
}
