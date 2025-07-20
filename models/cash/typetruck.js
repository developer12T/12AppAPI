const mongoose = require('mongoose')



const typeTruckSchema = mongoose.Schema({
  type_id: { type: String, require: true },
  type_name: { type: String, require: true },
  weight: { type: Number },
  payload: { type: Number },
  total_weight: { type: Number },
  law_weight: { type: Number },
  height_floor: { type: Number },
  width_floor: { type: Number },
  length_floor: { type: Number },
  front_pressure: { type: Number },
  back_pressure: { type: Number },
  set_speed: { type: Number },
  set_speed_city: { type: Number },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// const User = dbCA.model('User', userSchema)
// module.exports = { User }

module.exports = conn => {
  return {
    Typetrucks: conn.model('typetrucks', typeTruckSchema,'typetrucks')
  }
}
