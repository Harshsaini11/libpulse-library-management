const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  customId: { 
    type: String,      
    required: true, 
    unique: true,
    trim: true 
  },
  title: { 
    type: String, 
    required: true, 
    trim: true 
  },
  author: { 
    type: String, 
    required: true, 
    trim: true 
  },
  isIssued: { 
    type: Boolean, 
    default: false 
  },
  issuedTo: { 
    type: String, 
    default: null 
  },
  issuedDate: { 
    type: Date, 
    default: null 
  },
  dueDate: { 
    type: Date, 
    default: null 
  },
  loanDays: { 
    type: Number, 
    default: null 
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);