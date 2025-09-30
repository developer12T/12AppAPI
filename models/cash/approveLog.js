const mongoose = require('mongoose')



const approveLogSchema = mongoose.Schema({
  module: { type: String,  },
  user: { type: String,  },
  status: { type: String },
  id: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// const User = dbCA.model('User', userSchema)
// module.exports = { User }

module.exports = conn => {
  return {
    ApproveLogs: conn.model('approveLogs', approveLogSchema,'approveLogs')
  }
}
