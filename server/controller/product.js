const Joi = require("joi")
const _ = require("lodash")
const Fuse = require("fuse.js")
const db = require("../models")
const config = require("../config")

const categoryDictionary = Object.values(config.categories)
const locationDictionary = Object.values(config.locations)

const options = {
  shouldSort: true,
  matchAllTokens: true,
  findAllMatches: true,
  threshold: 0.6,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: undefined,
}

const schema = Joi.object().keys({
  title: Joi.string().required().min(5).max(25),
  price: Joi.number().required(),
  location: Joi.string().required(),
  description: Joi.string().max(500).required(),
  images: Joi.array(),
  category: Joi.string().valid(categoryDictionary),
  condition: Joi.string().valid(["used", "new"]).required(),
})

exports.getProducts = (req, res, next) => {
  const { page, category, location } = req.query
  // const { page, } = req.query || 1;
  const paginationInfo = {
    totalProducts: undefined,
    hasNextPage: undefined,
  }
  const cat = new Fuse(categoryDictionary, options)
  const categoryResult = categoryDictionary[cat.search(category)[0]]
  const loc = new Fuse(locationDictionary, options)
  const locationResult = locationDictionary[loc.search(location)[0]]

  db.Product.find({
    category: categoryResult || { $exists: true },
    location: locationResult || { $exists: true },
    isSold: false,
  })
    .countDocuments()
    .then(totalProducts => {
      paginationInfo.totalProducts = totalProducts
      paginationInfo.hasNextPage = page * config.defaultProductsPerPage < totalProducts
      return db.Product.find({
        category: categoryResult || { $exists: true },
        location: locationResult || { $exists: true },
        isSold: false,
      })
        .skip((page - 1) * config.defaultProductsPerPage)
        .sort({ createdAt: -1 })
        .limit(config.defaultProductsPerPage)
        .then(result => {
          if (result.length > 0) {
            const response = {}
            response.products = result
            response.paginationInfo = paginationInfo

            return res.status(200).json(response)
          }
          res.status(404).send("No product found on the database")
        })
        .catch(err => {
          res.status(500).send("Failed to retrive from database")
        })
    })
}

exports.getSingleProduct = (req, res, next) => {
  db.Product.findById(req.params.id)
    .populate("author", ["fullName", "contactNo"])
    .populate("reviews")
    .exec()
    .then(product => {
      if (!product) return res.status(404).send("No product found with this id")
      res.status(200).send(product)
    })
    .catch(err => {
      res.status(404).send("Product not found.")
    })
}

exports.editProduct = async (req, res, next) => {
  const { error } = Joi.validate(req.body, schema)
  if (error) return res.status(400).send(error.message)
  const oldProduct = await db.Product.findById(req.params.id)
  if (!oldProduct) return res.status(404).send("Product Not Found")
  oldProduct.title = req.body.title
  oldProduct.price = req.body.price
  oldProduct.description = req.body.description
  oldProduct.images = req.body.images
  oldProduct.save()
  res.status(200).send(oldProduct)
}

exports.newProduct = async (req, res, next) => {
  const { error } = Joi.validate(req.body, schema)
  if (error) return res.status(400).send(error.message)
  const author = await db.User.findById(req.user._id)
  if (!author) {
    const err = new Error()
    err.status = 400
    err.message = "User not found."
    return next(err)
  }
  const newProduct = req.body
  newProduct.author = author
  const result = await db.Product.create(newProduct)

  author.products.unshift(result)
  author.save()
  res.status(201).send(result)
}

exports.markSold = (req, res, next) => {
  db.Product.findById(req.params.id)
    .then(product => {
      product.isSold = true
      product.save()
      res.status(200).send(product)
    })
    .catch(err => {
      res.status(500).send("Failed to mark as sold")
    })
}

exports.deleteProduct = (req, res, next) => {
  db.Product.findByIdAndRemove(req.params.id)
    .then(response => {
      res.status(200).send(response)
    })
    .catch(err => {
      res.status(500).send("Product delation failed from Database")
    })
}
