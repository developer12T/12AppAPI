const mongoose = require('mongoose')

const campaignSchema = mongoose.Schema({
  id: { type: String, require: true },
  title: { type: String, require: true },
  des: { type: String, require: true },
  aticle: { type: String, require: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  link: { type: String, require: true },
  image: [{ type: String }],
  file: [{ type: String }],
}, {
  timestamps: true
})

// const User = dbCA.model('User', userSchema)
// module.exports = { User }

module.exports = (conn) => {
  return {
    Campaign: conn.model('campaign', campaignSchema,)
  }
}
