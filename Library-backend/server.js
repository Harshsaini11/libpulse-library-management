const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

app.use(express.static(path.join(__dirname, '..')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });
const Book = require('./models/Book');
const User = require('./models/User');
const Log = require('./models/Log');
const Setting = require('./models/Setting');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- DATABASE CONNECTION & INIT ---
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas Successfully');
    const fineSetting = await Setting.findOne({ key: 'dailyFineRate' });
    if (!fineSetting) {
      await Setting.create({ key: 'dailyFineRate', value: parseInt(process.env.DEFAULT_FINE_RATE) || 5 });
    }
  })
  .catch((err) => console.error('MongoDB Connection Error:', err));

// Activity Log Helper
async function recordLog(action, details) {
  try {
    await Log.create({ action, details });
  } catch (error) {
    console.error('Logging Error:', error.message);
  }
}

// --- BOOK ROUTES ---

// 1. Get All Books with dynamic Overdue & Fine Calculation
app.get('/api/books', async (req, res) => {
  try {
    const books = await Book.find().sort({ createdAt: -1 });
    const users = await User.find();
    const fineSetting = await Setting.findOne({ key: 'dailyFineRate' });
    const fineRate = fineSetting ? fineSetting.value : 5;

    const userMap = new Map(users.map(u => [String(u.customId), u.name]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formattedBooks = books.map(book => {
      let overdueDays = 0;
      let fine = 0;
      let isOverdue = false;

      if (book.isIssued && book.dueDate) {
        const due = new Date(book.dueDate);
        due.setHours(0, 0, 0, 0);
        const diffTime = today - due;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
          overdueDays = diffDays;
          fine = overdueDays * fineRate;
          isOverdue = true;
        }
      }

      return {
        id: book.customId,
        title: book.title,
        author: book.author,
        is_issued: book.isIssued ? 1 : 0,
        issued_to: book.issuedTo,
        borrowerName: book.issuedTo ? (userMap.get(String(book.issuedTo)) || 'Unknown') : null,
        issued_date: book.issuedDate ? book.issuedDate.toISOString().split('T')[0] : null,
        due_date: book.dueDate ? book.dueDate.toISOString().split('T')[0] : null,
        loan_days: book.loanDays,
        overdueDays,
        fine,
        isOverdue
      };
    });

    res.json(formattedBooks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Add New Book
app.post('/api/books', async (req, res) => {
  try {
    const { customId, title, author } = req.body;
    const cleanId = String(customId).trim();

    const exists = await Book.findOne({ customId: cleanId });
    if (exists) return res.status(400).json({ message: 'Book ID already exists' });

    const newBook = await Book.create({ customId: cleanId, title: title.trim(), author: author.trim() });
    await recordLog('ADD_BOOK', `Added Book ID ${cleanId} (${title})`);
    res.status(201).json(newBook);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Edit Book Metadata
app.put('/api/books/:customId', async (req, res) => {
  try {
    const { customId } = req.params;
    const { title, author } = req.body;
    const cleanId = String(customId).trim();

    const book = await Book.findOneAndUpdate(
      { customId: cleanId },
      { title: title.trim(), author: author.trim() },
      { new: true }
    );
    if (!book) return res.status(404).json({ message: 'Book ID not found' });

    await recordLog('EDIT_BOOK', `Updated metadata for Book ID ${cleanId}`);
    res.json(book);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Issue Book with Duration
app.post('/api/books/issue', async (req, res) => {
  try {
    const { bookId, userId, loanDays } = req.body;
    const cleanBookId = String(bookId || '').trim();
    const cleanUserId = String(userId || '').trim();

    if (!cleanBookId || !cleanUserId) {
      return res.status(400).json({ message: 'Both Book ID and User ID are required' });
    }

    // 1. Strict Member Existence Check
    const user = await User.findOne({
      customId: { $regex: new RegExp(`^${cleanUserId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (!user) {
      return res.status(404).json({ 
        message: `Member ID '${cleanUserId}' is not registered! Please add this member first.` 
      });
    }

    // 2. Find Book
    const book = await Book.findOne({
      customId: { $regex: new RegExp(`^${cleanBookId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });

    if (!book) {
      return res.status(404).json({ message: `Book ID '${cleanBookId}' not found in inventory` });
    }

    if (book.isIssued) {
      return res.status(400).json({ message: `Book '${book.title}' is already issued to Member: ${book.issuedTo}` });
    }

    const issuedDate = new Date();
    const dueDate = new Date();
    const days = parseInt(loanDays, 10) || 7;
    dueDate.setDate(issuedDate.getDate() + days);

    book.isIssued = true;
    book.issuedTo = user.customId;
    book.issuedDate = issuedDate;
    book.dueDate = dueDate;
    book.loanDays = days;
    await book.save();

    await recordLog('ISSUE_BOOK', `Book '${book.title}' (#${book.customId}) issued to ${user.name} (ID: ${user.customId}) for ${days} days`);
    res.json({ message: `Book successfully issued to ${user.name}! (Due: ${dueDate.toISOString().split('T')[0]})`, book });
  } catch (error) {
    console.error('Issue Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Return Book & Fine Collection
app.post('/api/books/return', async (req, res) => {
  try {
    const { bookId } = req.body;
    const cleanBookId = String(bookId).trim();

    const book = await Book.findOne({ customId: cleanBookId });
    if (!book) return res.status(404).json({ message: 'Book not found' });
    if (!book.isIssued) return res.status(400).json({ message: 'Book is not currently issued' });

    const user = await User.findOne({ customId: book.issuedTo });
    const fineSetting = await Setting.findOne({ key: 'dailyFineRate' });
    const fineRate = fineSetting ? fineSetting.value : 5;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(book.dueDate);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
    let fine = 0;
    if (diffDays > 0) {
      fine = diffDays * fineRate;
    }

    book.isIssued = false;
    book.issuedTo = null;
    book.issuedDate = null;
    book.dueDate = null;
    book.loanDays = null;
    await book.save();

    if (fine > 0) {
      await recordLog('RETURN_WITH_FINE', `Book #${cleanBookId} returned by ${user ? user.name : 'User'}. Collected Fine: ₹${fine} (${diffDays} days late).`);
    } else {
      await recordLog('RETURN_BOOK', `Book #${cleanBookId} returned on time by ${user ? user.name : 'User'}`);
    }

    res.json({ message: 'Book returned successfully', fineCollected: fine, overdueDays: Math.max(0, diffDays) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 6. Delete Book (by ID or Title)
app.delete('/api/books/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const cleanIdentifier = decodeURIComponent(identifier).trim();

    // ID ya Title dono me se kisi ek se match karega (Title case-insensitive)
    const book = await Book.findOne({
      $or: [
        { customId: cleanIdentifier },
        { title: { $regex: new RegExp(`^${cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    });

    if (!book) {
      return res.status(404).json({ message: `No book found matching '${cleanIdentifier}' (ID or Title)` });
    }

    if (book.isIssued) {
      return res.status(400).json({ message: `Cannot delete '${book.title}' because it is currently issued to a member` });
    }

    await Book.deleteOne({ _id: book._id });
    await recordLog('DELETE_BOOK', `Deleted Book ID #${book.customId} (${book.title})`);
    
    res.json({ message: `Book '${book.title}' (ID: ${book.customId}) deleted successfully` });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- USER DIRECTORY ROUTES ---

// 1. Get Users with Active Borrows & Pending Fines
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const books = await Book.find({ isIssued: true });
    const fineSetting = await Setting.findOne({ key: 'dailyFineRate' });
    const fineRate = fineSetting ? fineSetting.value : 5;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const userSummary = users.map(user => {
      const borrowed = books.filter(b => String(b.issuedTo) === String(user.customId));
      let pendingFine = 0;

      borrowed.forEach(b => {
        if (b.dueDate) {
          const due = new Date(b.dueDate);
          due.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
          if (diffDays > 0) {
            pendingFine += (diffDays * fineRate);
          }
        }
      });

      return {
        id: user.customId,
        name: user.name,
        issuedCount: borrowed.length,
        borrowedTitles: borrowed.map(b => b.title).join(', ') || 'No active loans',
        totalFineDue: pendingFine
      };
    });

    res.json(userSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Add Member
app.post('/api/users', async (req, res) => {
  try {
    const { customId, name } = req.body;
    const cleanId = String(customId).trim();

    const exists = await User.findOne({ customId: cleanId });
    if (exists) return res.status(400).json({ message: 'Member ID already exists' });

    const user = await User.create({ customId: cleanId, name: name.trim() });
    await recordLog('ADD_USER', `Registered Member ID #${cleanId} (${name})`);
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Edit User Route
app.put('/api/users/:customId', async (req, res) => {
  try {
    const cleanId = String(req.params.customId).trim();
    const { name } = req.body;

    const user = await User.findOneAndUpdate(
      { customId: cleanId },
      { name: name.trim() },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Member not found' });

    await recordLog('EDIT_USER', `Updated Member name to ${name} (ID: ${cleanId})`);
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 4. Delete User Route
app.delete('/api/users/:customId', async (req, res) => {
  try {
    const cleanId = String(req.params.customId).trim();

    // Check if user has active borrowed books
    const hasIssuedBooks = await Book.findOne({ issuedTo: cleanId });
    if (hasIssuedBooks) {
      return res.status(400).json({ message: 'Cannot delete member with active borrowed books' });
    }

    const user = await User.findOneAndDelete({ customId: cleanId });
    if (!user) return res.status(404).json({ message: 'Member not found' });

    await recordLog('DELETE_USER', `Deleted Member ID #${cleanId}`);
    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// --- OPTIMIZED BATCH RESOLVE (Books) ---
app.post('/api/books/batch-resolve', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items to process' });
    }

    const operations = items.map(item => {
      if (item.action === 'replace') {
        return {
          updateOne: {
            filter: { customId: item.customId },
            update: { $set: { title: item.title, author: item.author } }
          }
        };
      } else {
        return {
          insertOne: {
            document: {
              customId: item.customId,
              title: item.title,
              author: item.author,
              isIssued: false,
              issuedTo: null,
              issuedDate: null,
              dueDate: null,
              loanDays: null
            }
          }
        };
      }
    });

    // Executes all 1000 operations in a single atomic database query
    const result = await Book.bulkWrite(operations, { ordered: false });
    
    const inserted = result.insertedCount || (result.upsertedCount || 0);
    const modified = result.modifiedCount || 0;

    await recordLog('EXCEL_SYNC_BOOKS', `Bulk processed ${items.length} books (${inserted} added, ${modified} updated).`);
    res.json({ message: `Successfully saved ${items.length} books to MongoDB! (${inserted} inserted, ${modified} updated)` });
  } catch (error) {
    console.error('Batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- OPTIMIZED BATCH RESOLVE (Users) ---
app.post('/api/users/batch-resolve', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'No items to process' });
    }

    const operations = items.map(item => {
      if (item.action === 'replace') {
        return {
          updateOne: {
            filter: { customId: item.customId },
            update: { $set: { name: item.name } }
          }
        };
      } else {
        return {
          insertOne: {
            document: {
              customId: item.customId,
              name: item.name
            }
          }
        };
      }
    });

    const result = await User.bulkWrite(operations, { ordered: false });
    const inserted = result.insertedCount || (result.upsertedCount || 0);
    const modified = result.modifiedCount || 0;

    await recordLog('EXCEL_SYNC_USERS', `Bulk processed ${items.length} users (${inserted} added, ${modified} updated).`);
    res.json({ message: `Successfully saved ${items.length} members to MongoDB! (${inserted} inserted, ${modified} updated)` });
  } catch (error) {
    console.error('Batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- SETTINGS & AUDIT LOGS ---

// Get / Set Fine Policy
app.get('/api/settings/fine-rate', async (req, res) => {
  const setting = await Setting.findOne({ key: 'dailyFineRate' });
  res.json({ rate: setting ? setting.value : 5 });
});

app.put('/api/settings/fine-rate', async (req, res) => {
  try {
    const { rate } = req.body;
    await Setting.findOneAndUpdate(
      { key: 'dailyFineRate' },
      { value: Number(rate) },
      { upsert: true }
    );
    await recordLog('FINE_RATE_UPDATE', `Updated fine rate policy to ₹${rate}/day`);
    res.json({ message: 'Fine rate updated', rate });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Audit Logs
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await Log.find().sort({ timestamp: -1 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 1. BULK IMPORT BOOKS VIA EXCEL ---
app.post('/api/books/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please upload an Excel file' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: 'Excel sheet is empty' });
    }

    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of data) {
      const rawId = row['Book ID'] || row['BookId'] || row['book id'] || row['id'] || row['ID'];
      const customId = rawId ? String(rawId).trim() : null;
      const title = (row['Title'] || row['title'] || row['Book Title'] || '').toString().trim();
      const author = (row['Author'] || row['author'] || row['Author Name'] || '').toString().trim();

      if (!customId || !title || !author) {
        skippedCount++;
        continue;
      }

      // Duplicate Check
      const exists = await Book.findOne({ customId });
      if (exists) {
        skippedCount++;
        continue;
      }

      await Book.create({ customId, title, author });
      insertedCount++;
    }

    await recordLog('BULK_IMPORT_BOOKS', `Imported ${insertedCount} books from Excel (Skipped: ${skippedCount})`);
    res.json({ message: `Successfully imported ${insertedCount} books! (${skippedCount} skipped/duplicates)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- 2. BULK IMPORT USERS VIA EXCEL ---
app.post('/api/users/upload-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Please upload an Excel file' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!data || data.length === 0) {
      return res.status(400).json({ message: 'Excel sheet is empty' });
    }

    let insertedCount = 0;
    let skippedCount = 0;

    for (const row of data) {
      const rawId = row['User ID'] || row['UserId'] || row['user id'] || row['id'] || row['ID'];
      const customId = rawId ? String(rawId).trim() : null;
      const name = (row['Name'] || row['name'] || row['User Name'] || row['Member Name'] || '').toString().trim();

      if (!customId || !name) {
        skippedCount++;
        continue;
      }

      const exists = await User.findOne({ customId });
      if (exists) {
        skippedCount++;
        continue;
      }

      await User.create({ customId, name });
      insertedCount++;
    }

    await recordLog('BULK_IMPORT_USERS', `Imported ${insertedCount} members from Excel (Skipped: ${skippedCount})`);
    res.json({ message: `Successfully imported ${insertedCount} members! (${skippedCount} skipped/duplicates)` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
