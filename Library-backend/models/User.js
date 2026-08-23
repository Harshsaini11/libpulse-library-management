const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  customId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: true, 
    trim: true 
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);