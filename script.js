const API_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
  ? 'http://localhost:5000/api'
  : '/api';

// Global Cache for Dynamic Overdue & Fine Rate
let currentFineRate = 5;
let cachedBooks = [];

let conflictQueue = [];
let resolvedBatch = [];
let currentUploadType = 'books';
let currentConflictIndex = 0;

let activeDashboardTab = 'books';
let cachedUsers = [];
let cachedLogs = [];

// --- 1. INITIALIZE & FETCH SYSTEM SETTINGS ---
async function initSystem() {
  await fetchFineRate();
  await loadBooksData();
  await updateMetrics();
}

async function fetchFineRate() {
  try {
    const res = await fetch(`${API_BASE}/settings/fine-rate`);
    if (res.ok) {
      const data = await res.json();
      currentFineRate = Number(data.rate) || 5;
      updateFineRateUI();
    }
  } catch (error) {
    console.error('Fine rate fetch error:', error);
  }
}

function updateFineRateUI() {
  const sidebarSpan = document.getElementById('txtSidebarFineRate');
  const inputField = document.getElementById('txtDailyFineRate');

  if (sidebarSpan) sidebarSpan.textContent = currentFineRate;
  if (inputField) inputField.value = currentFineRate;
}

// --- 2. TOAST NOTIFICATION UTILITY ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// --- 3. METRICS / STATS SUMMARY ---
async function updateMetrics() {
  try {
    const [booksRes, usersRes] = await Promise.all([
      fetch(`${API_BASE}/books`),
      fetch(`${API_BASE}/users`)
    ]);

    const books = await booksRes.json();
    const users = await usersRes.json();

    const total = books.length;
    const issuedList = books.filter(b => b.is_issued === 1);
    const available = total - issuedList.length;

    let totalFine = 0;
    let overdueCount = 0;

    issuedList.forEach(b => {
      if (b.isOverdue) {
        totalFine += (b.fine || 0);
        overdueCount++;
      }
    });

    const elTotal = document.getElementById('statTotalBooks');
    const elAvail = document.getElementById('statAvailableBooks');
    const elIssued = document.getElementById('statIssuedBooks');
    const elFines = document.getElementById('statTotalFines');
    const elOverdue = document.getElementById('statOverdueCount');

    if (elTotal) elTotal.textContent = total;
    if (elAvail) elAvail.textContent = available;
    if (elIssued) elIssued.textContent = issuedList.length;
    if (elFines) elFines.textContent = totalFine;
    if (elOverdue) elOverdue.textContent = overdueCount;
  } catch (error) {
    console.error('Metrics update error:', error);
  }
}

// --- 4. MODAL CONTROLS ---
function openActionModal(modalId) {
  document.getElementById(modalId).classList.add('active');
  if (modalId === 'modalIssueBook') {
    selectDuration(7);
  }
}

function openSettingsModal() {
  updateFineRateUI();
  document.getElementById('modalSettings').classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');

  if (modalId === 'modalReturnBook') {
    const previewBox = document.getElementById('returnPreviewBox');
    if (previewBox) previewBox.style.display = 'none';
    const returnInput = document.getElementById('txtReturnBookId');
    if (returnInput) returnInput.value = '';
  }
}

// --- DURATION SELECTOR (Fixed ID from txtIssueDays to numLoanDays) ---
function selectDuration(days) {
  const input = document.getElementById('numLoanDays');
  if (input) input.value = days;
  document.querySelectorAll('.preset-pill-group .btn-preset').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(`${days} Days`));
  });
}

// --- 9. CLEAN ISOLATED PRINT UTILITY ---
function printTable() {
  let title = 'Books Inventory Catalog';
  let rowsHtml = '';
  
  if (activeDashboardTab === 'books') {
    title = 'Books Inventory Catalog';
    cachedBooks.forEach(b => {
      const status = b.is_issued === 0 ? 'Available' : (b.isOverdue ? `Overdue (${b.overdueDays}d)` : 'Issued');
      rowsHtml += `<tr>
        <td><b>${b.id}</b></td>
        <td>${b.title}</td>
        <td>${b.author}</td>
        <td>${status}</td>
        <td>${b.borrowerName || '—'}</td>
        <td>${b.due_date || '—'}</td>
        <td>${b.fine > 0 ? '₹' + b.fine : '—'}</td>
      </tr>`;
    });
  } else if (activeDashboardTab === 'users') {
    title = 'Members Directory & Fine Summary';
    cachedUsers.forEach(u => {
      rowsHtml += `<tr>
        <td><b>${u.id}</b></td>
        <td>${u.name}</td>
        <td>${u.issuedCount} Book(s)</td>
        <td>${u.borrowedTitles}</td>
        <td>₹${u.totalFineDue}</td>
      </tr>`;
    });
  } else {
    title = 'System Audit Trail Logs';
    cachedLogs.forEach((l, idx) => {
      rowsHtml += `<tr>
        <td>#${cachedLogs.length - idx}</td>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td><b>${l.action}</b></td>
        <td>${l.details}</td>
      </tr>`;
    });
  }

  const printWin = window.open('', '_blank', 'width=900,height=650');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #0f172a; }
        h2 { margin: 0 0 6px; }
        p { margin: 0 0 16px; color: #64748b; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; }
        tr:nth-child(even) td { background: #f8fafc; }
        @page { size: auto; margin: 12mm; }
      </style>
    </head>
    <body>
      <h2>LibPulse &bull; ${title}</h2>
      <p>Generated on: ${new Date().toLocaleString()}</p>
      <table>
        <tbody>${rowsHtml}</tbody>
      </table>
    </body>
    </html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); printWin.close(); }, 300);
}

// Close on Backdrop Click
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('active');
  }
});

// --- SYNC & REFRESH ALL TABS DATA ---
async function refreshList() {
  try {
    // 1. Reset Search inputs safely
    const searchInput = document.getElementById('txtSearch');
    if (searchInput) searchInput.value = '';

    const filterBooks = document.getElementById('comboFilterBooks') || document.getElementById('comboFilterStatus');
    if (filterBooks) filterBooks.value = 'All';

    const filterUsers = document.getElementById('comboFilterUsers');
    if (filterUsers) filterUsers.value = 'All';

    const filterLogs = document.getElementById('comboFilterLogs');
    if (filterLogs) filterLogs.value = 'All';

    // 2. Fetch all 3 datasets & update metrics together
    await Promise.all([
      loadBooksData(),
      loadUsersData(),
      loadLogsData(),
      updateMetrics()
    ]);

    // 3. Re-render currently active view
    handleUnifiedSearch();

    showToast('Catalog & members synced successfully!', 'success');
  } catch (error) {
    console.error('Sync error:', error);
    showToast('Failed to sync catalog data', 'error');
  }
}

// --- 5. BOOK OPERATIONS (CRUD ON MONGODB) ---

// A. Load All Books
async function loadBooksData() {
  const tbody = document.getElementById('booksTableBody');
  const keyword = document.getElementById('txtSearch').value.trim().toLowerCase();
  const filter = document.getElementById('comboFilterStatus').value;

  try {
    const res = await fetch(`${API_BASE}/books`);
    if (!res.ok) throw new Error('Failed to retrieve catalog');

    cachedBooks = await res.json();
    tbody.innerHTML = '';

    const filtered = cachedBooks.filter(b => {
      const borrowerName = b.borrowerName ? b.borrowerName.toLowerCase() : '';

      const matchesKey = !keyword || 
        b.id.toString().toLowerCase().includes(keyword) || 
        b.title.toLowerCase().includes(keyword) || 
        b.author.toLowerCase().includes(keyword) ||
        borrowerName.includes(keyword);

      let matchesStatus = true;
      if (filter === 'Available') matchesStatus = (b.is_issued === 0);
      if (filter === 'Issued') matchesStatus = (b.is_issued === 1 && !b.isOverdue);
      if (filter === 'Overdue') matchesStatus = b.isOverdue;

      return matchesKey && matchesStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No books matching current criteria.</td></tr>`;
      return;
    }

    filtered.forEach(b => {
      let statusHtml = '';
      let fineHtml = '<span style="color: #94a3b8;">&mdash;</span>';

      if (b.is_issued === 0) {
        statusHtml = `<span class="status-pill status-available">Available</span>`;
      } else if (b.isOverdue) {
        statusHtml = `<span class="status-pill status-overdue">Overdue (${b.overdueDays}d)</span>`;
        fineHtml = `<span class="fine-badge">₹${b.fine} (₹${currentFineRate}/d)</span>`;
      } else {
        statusHtml = `<span class="status-pill status-issued">Active Loan</span>`;
      }

      // 1. Title ke end se "Volume 906" ya numbers clean karne ke liye:
      const cleanTitle = b.title.replace(/\s+(Volume\s+\d+|\d+)$/i, '').trim();

      // 2. Author name formatting (fallback check ke saath):
      const displayAuthor = (b.author && b.author.trim() !== '') ? b.author.trim() : 'Unknown Author';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-weight: 700; color: var(--primary);">${b.id}</span></td>
        <td><strong style="color: var(--text-main); font-size: 0.92rem;">${cleanTitle}</strong></td>
        <td><span style="color: var(--text-main); font-weight: 600;">${displayAuthor}</span></td>
        <td>${statusHtml}</td>
        <td>${b.borrowerName ? `<span style="font-weight: 600;">${b.borrowerName}</span> <small style="color: var(--text-muted);">(ID: ${b.issued_to})</small>` : '<span style="color: #cbd5e1;">&mdash;</span>'}</td>
        <td>${b.due_date ? `<strong>${b.due_date}</strong>` : '<span style="color: #cbd5e1;">&mdash;</span>'}</td>
        <td>${fineHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Fetch Error:', error);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--rose); padding: 30px;">Error connecting to MongoDB server: ${error.message}</td></tr>`;
  }
}

// --- LIVE MODAL FEEDBACK HELPER ---
function setModalFeedback(containerId, message, type = 'success') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const icon = type === 'success' 
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e11d48" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

  container.className = `modal-feedback ${type}`;
  container.innerHTML = `${icon} <span>${message}</span>`;
  container.style.display = 'flex';

  setTimeout(() => {
    container.style.display = 'none';
  }, 4000);
}

// B. Add Book
async function handleAddBook(event) {
  if (event) event.preventDefault();
  const customId = document.getElementById('txtAddBookId').value.trim();
  const title = document.getElementById('txtAddTitle').value.trim();
  const author = document.getElementById('txtAddAuthor').value.trim();

  if (!customId || !title || !author) {
    setModalFeedback('msgAddBook', 'Please fill all required fields', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customId, title, author })
    });
    const data = await res.json();

    if (!res.ok) {
      setModalFeedback('msgAddBook', data.message || 'Failed to add book', 'error');
      showToast(data.message || 'Failed to add book', 'error');
    } else {
      setModalFeedback('msgAddBook', `Book '${title}' (#${customId}) Added Successfully!`, 'success');
      showToast('Book added successfully!', 'success');
      document.getElementById('formAddBookManual').reset();
      await loadBooksData();
      await loadLogsData();
      await updateMetrics();
    }
  } catch (error) {
    setModalFeedback('msgAddBook', 'Server connection error', 'error');
  }
}

// --- C. EDIT BOOK ---
async function handleEditBook(event) {
  if (event) event.preventDefault();
  const customId = document.getElementById('txtEditBookId').value.trim();
  const title = document.getElementById('txtEditTitle').value.trim();
  const author = document.getElementById('txtEditAuthor').value.trim();

  if (!customId || !title || !author) return showToast('Please fill all fields', 'error');

  try {
    const res = await fetch(`${API_BASE}/books/${encodeURIComponent(customId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, author })
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.message || 'Failed to update book', 'error');

    showToast('Book updated successfully!', 'success');
    closeModal('modalEditBook');
    document.getElementById('formEditBook').reset();
    await loadBooksData();
  } catch (error) {
    showToast('Server connection failed', 'error');
  }
}

function setLoanPreset(days, btnElement) {
  document.getElementById('numLoanDays').value = days;
  document.querySelectorAll('.preset-pill-group .btn-preset').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
}

// --- D. ISSUE BOOK ---
async function handleIssueBook(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  const bookIdInput = document.getElementById('txtIssueBookId');
  const userIdInput = document.getElementById('txtIssueUserId');
  const loanDaysInput = document.getElementById('numLoanDays');
  const submitBtn = document.getElementById('btnSubmitIssue');

  const bookId = bookIdInput ? bookIdInput.value.trim() : '';
  const userId = userIdInput ? userIdInput.value.trim() : '';
  const loanDays = parseInt(loanDaysInput ? loanDaysInput.value : 7, 10) || 7;

  if (!bookId || !userId) {
    showToast('Please provide both Book ID and User ID', 'error');
    return;
  }

  // Visual loading feedback
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Issuing...';
  }

  try {
    const res = await fetch(`${API_BASE}/books/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ bookId, userId, loanDays })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Failed to issue book', 'error');
    } else {
      showToast(data.message || 'Book issued successfully!', 'success');
      closeModal('modalIssueBook');
      document.getElementById('formIssueBook').reset();
      setLoanPreset(7);
      await loadBooksData();
      await loadUsersData();
      await updateMetrics();
    }
  } catch (error) {
    console.error('Issue error:', error);
    showToast('Backend connection failed. Make sure server is running on port 5000.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Issue Book';
    }
  }
}

// E. Check Return Preview
function checkReturnBookPreview() {
  const bookId = parseInt(document.getElementById('txtReturnBookId').value, 10);
  const previewBox = document.getElementById('returnPreviewBox');

  if (!bookId) {
    previewBox.style.display = 'none';
    return;
  }

  const book = cachedBooks.find(b => b.id === bookId);

  if (!book || book.is_issued === 0) {
    previewBox.style.display = 'none';
    return;
  }

  document.getElementById('previewBookTitle').textContent = `#${book.id} - ${book.title}`;
  document.getElementById('previewBorrower').textContent = book.borrowerName ? `${book.borrowerName} (ID: ${book.issued_to})` : '-';
  document.getElementById('previewIssuedDate').textContent = book.issued_date || '-';
  document.getElementById('previewDueDate').textContent = book.due_date || '-';
  document.getElementById('previewOverdueDays').textContent = `${book.overdueDays} Days`;
  document.getElementById('previewFineAmount').textContent = `₹${book.fine}`;

  const previewBadge = document.getElementById('previewBadge');
  if (book.isOverdue) {
    previewBadge.className = 'status-pill status-overdue';
    previewBadge.textContent = 'Overdue Fine Due';
  } else {
    previewBadge.className = 'status-pill status-available';
    previewBadge.textContent = 'Returned on Time';
  }

  previewBox.style.display = 'block';
}

// --- F. RETURN BOOK ---
async function handleReturnBook(event) {
  if (event) event.preventDefault();
  const bookId = document.getElementById('txtReturnBookId').value.trim();

  if (!bookId) return showToast('Please enter Book ID', 'error');

  try {
    const res = await fetch(`${API_BASE}/books/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId })
    });
    const data = await res.json();
    if (!res.ok) return showToast(data.message || 'Failed to return book', 'error');

    showToast(data.message, 'success');
    closeModal('modalReturnBook');
    document.getElementById('formReturnBook').reset();
    await loadBooksData();
    await updateMetrics();
  } catch (error) {
    showToast('Server connection failed', 'error');
  }
}

// G. Delete Book
async function handleDeleteBook(event) {
  if (event) event.preventDefault();
  const inputVal = document.getElementById('txtDeleteBookIdentifier').value.trim();

  if (!inputVal) {
    setModalFeedback('msgDeleteBook', 'Please enter Book ID or Title', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to delete book matching: "${inputVal}"?`)) return;

  try {
    const res = await fetch(`${API_BASE}/books/${encodeURIComponent(inputVal)}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (!res.ok) {
      setModalFeedback('msgDeleteBook', data.message || 'Book deletion failed', 'error');
      showToast(data.message || 'Deletion failed', 'error');
    } else {
      setModalFeedback('msgDeleteBook', `Book Deleted: ${data.message}`, 'success');
      showToast(data.message, 'success');
      document.getElementById('txtDeleteBookIdentifier').value = '';
      await loadBooksData();
      await loadLogsData();
      await updateMetrics();
    }
  } catch (error) {
    setModalFeedback('msgDeleteBook', 'Server connection error', 'error');
  }
}

// --- 6. FINE RATE POLICY SETTINGS ---
async function handleSaveFineRate(e) {
  if (e) e.preventDefault();
  
  const rateInput = document.getElementById('txtDailyFineRate');
  const rate = parseInt(rateInput.value, 10);

  if (isNaN(rate) || rate < 1) {
    showToast('Please enter a valid fine amount (at least ₹1)', 'error');
    return;
  }

  try {
    // Try POST first (standard Express setting route)
    let res = await fetch(`${API_BASE}/settings/fine-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rate })
    });

    // If backend uses PUT, retry with PUT
    if (res.status === 404 || res.status === 405) {
      res = await fetch(`${API_BASE}/settings/fine-rate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate })
      });
    }

    const data = await res.json();

    if (!res.ok) {
      showToast(data.message || 'Error updating fine rate', 'error');
      return;
    }

    currentFineRate = rate;
    updateFineRateUI();
    closeModal('modalSettings');
    showToast(`Fine policy updated to ₹${rate}/day!`, 'success');

    // Re-fetch all tables and metric cards with new calculated fines
    await loadBooksData();
    await loadUsersData();
    await updateMetrics();

  } catch (error) {
    console.error('Fine save error:', error);
    showToast('Backend connection failed', 'error');
  }
}

// --- 7. USERS DIRECTORY MANAGEMENT ---
async function openUsersModal() {
  await loadUsersData();
  document.getElementById('userModal').classList.add('active');
}

// --- LOAD USERS DATA ---
async function loadUsersData() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) throw new Error('Failed to load users');

    const users = await res.json();
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No registered members found.</td></tr>`;
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      const loanBadge = u.issuedCount > 0 
        ? `<span class="status-pill status-issued" style="font-size: 0.75rem;">${u.issuedCount} Book(s)</span>`
        : `<span class="status-pill status-available" style="font-size: 0.75rem;">0 Book(s)</span>`;

      const fineDisplay = u.totalFineDue > 0 
        ? `<span style="color: var(--rose); font-weight: 700;">₹${u.totalFineDue}</span>`
        : `<span style="color: var(--emerald); font-weight: 600;">₹0</span>`;

      tr.innerHTML = `
        <td><strong style="color: var(--primary); font-size: 0.88rem;">${u.id}</strong></td>
        <td><span style="font-weight: 600; color: var(--text-main);">${u.name}</span></td>
        <td>${loanBadge}</td>
        <td><small style="color: var(--text-muted);">${u.borrowedTitles}</small></td>
        <td>${fineDisplay}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Load Users Error:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--rose); padding: 20px;">Failed to load members.</td></tr>`;
  }
}

async function handleAddUser() {
  const customId = document.getElementById('txtUserId').value.trim();
  const name = document.getElementById('txtUserName').value.trim();

  if (!customId || !name) {
    setModalFeedback('msgUserModal', 'Enter both Member ID and Name', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customId, name })
    });
    const data = await res.json();

    if (!res.ok) {
      setModalFeedback('msgUserModal', data.message || 'Registration failed', 'error');
      showToast(data.message || 'Failed', 'error');
    } else {
      setModalFeedback('msgUserModal', `Member '${name}' (#${customId}) Registered!`, 'success');
      showToast('Member added successfully!', 'success');
      document.getElementById('txtUserId').value = '';
      document.getElementById('txtUserName').value = '';
      await loadUsersData();
      await loadLogsData();
      await updateMetrics();
    }
  } catch (error) {
    setModalFeedback('msgUserModal', 'Server connection failed', 'error');
  }
}

async function handleEditUser() {
  const customId = document.getElementById('txtUserId').value.trim();
  const name = document.getElementById('txtUserName').value.trim();

  if (!customId || !name) {
    setModalFeedback('msgUserModal', 'Provide User ID and new Name to update', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(customId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();

    if (!res.ok) {
      setModalFeedback('msgUserModal', data.message || 'User not found', 'error');
      showToast(data.message || 'Update failed', 'error');
    } else {
      setModalFeedback('msgUserModal', `Member Name Updated to '${name}'!`, 'success');
      showToast('Member updated!', 'success');
      await loadUsersData();
      await loadBooksData();
      await loadLogsData();
    }
  } catch (error) {
    setModalFeedback('msgUserModal', 'Server connection failed', 'error');
  }
}

async function handleDeleteUser() {
  const customId = document.getElementById('txtUserId').value.trim();
  if (!customId) {
    setModalFeedback('msgUserModal', 'Enter Member ID to delete', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to delete Member ID: ${customId}?`)) return;

  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(customId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (!res.ok) {
      setModalFeedback('msgUserModal', data.message || 'Could not delete member', 'error');
      showToast(data.message || 'Delete failed', 'error');
    } else {
      setModalFeedback('msgUserModal', `Member #${customId} Deleted Successfully!`, 'success');
      showToast(data.message, 'success');
      document.getElementById('txtUserId').value = '';
      document.getElementById('txtUserName').value = '';
      await loadUsersData();
      await loadLogsData();
      await updateMetrics();
    }
  } catch (error) {
    setModalFeedback('msgUserModal', 'Server connection failed', 'error');
  }
}

function clearUserInputs() {
  document.getElementById('txtUserId').value = '';
  document.getElementById('txtUserName').value = '';
}

// --- 8. AUDIT ACTIVITY LOGS ---
async function openHistoryModal() {
  const tbody = document.getElementById('historyTableBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px;">Loading logs...</td></tr>';
  document.getElementById('historyModal').classList.add('active');

  try {
    const res = await fetch(`${API_BASE}/logs`);
    const logs = await res.json();
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No activity logs recorded.</td></tr>';
      return;
    }

    logs.forEach((l, index) => {
      const tr = document.createElement('tr');
      const formattedDate = new Date(l.timestamp).toLocaleString();
      tr.innerHTML = `
        <td><span style="font-weight: 700; color: var(--primary);">#${logs.length - index}</span></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${formattedDate}</td>
        <td><strong style="color: var(--text-main);">${l.action}</strong></td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${l.details}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error('Error loading logs:', error);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--rose); padding: 20px;">Error loading audit trail</td></tr>`;
  }
}

// --- LIVE HERO CLOCK ---
function startHeroClock() {
  function tick() {
    const clock = document.getElementById('lblLiveClock');
    if (clock) {
      const now = new Date();
      clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  tick();
  setInterval(tick, 1000);
}

window.addEventListener('DOMContentLoaded', () => {
  startHeroClock();
});

// --- TAB SWITCHER FUNCTIONS ---
function switchBookInputMode(mode) {
  const formManual = document.getElementById('formAddBookManual');
  const dropzoneExcel = document.getElementById('dropzoneBookExcel');
  const tabManual = document.getElementById('tabBookManual');
  const tabExcel = document.getElementById('tabBookExcel');

  if (mode === 'manual') {
    formManual.style.display = 'block';
    dropzoneExcel.style.display = 'none';
    tabManual.classList.add('active');
    tabExcel.classList.remove('active');
  } else {
    formManual.style.display = 'none';
    dropzoneExcel.style.display = 'block';
    tabManual.classList.remove('active');
    tabExcel.classList.add('active');
  }
}

function switchUserInputMode(mode) {
  const manualTab = document.getElementById('tabUserManual');
  const excelTab = document.getElementById('tabUserExcel');
  const manualControls = document.getElementById('userManualControls');
  const excelControls = document.getElementById('userExcelControls');

  if (mode === 'manual') {
    manualTab.classList.add('active');
    excelTab.classList.remove('active');
    manualControls.style.display = 'flex';
    excelControls.style.display = 'none';
  } else {
    excelTab.classList.add('active');
    manualTab.classList.remove('active');
    manualControls.style.display = 'none';
    excelControls.style.display = 'block';
  }
}

// --- EXCEL UPLOAD HANDLER ---
async function handleExcelUpload(type, inputElement) {
  const file = inputElement.files[0];
  if (!file) return;

  if (typeof XLSX === 'undefined') {
    showToast('XLSX library not loaded. Check internet connection!', 'error');
    inputElement.value = '';
    return;
  }

  currentUploadType = type;
  conflictQueue = [];
  resolvedBatch = [];
  currentConflictIndex = 0;

  showToast(`Reading ${type} file...`, 'success');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        return showToast('Uploaded Excel file is empty!', 'error');
      }

      // Fetch existing database records
      const res = await fetch(`${API_BASE}/${type}`);
      const existingList = await res.json();
      
      const existingMap = new Map();
      existingList.forEach(item => {
        if (item.id !== undefined && item.id !== null) {
          existingMap.set(String(item.id).trim().toLowerCase(), item);
        }
      });

      let identicalCount = 0;

      rawRows.forEach((row) => {
        // Normalize keys (lowercase and remove extra spaces)
        const cleanRow = {};
        Object.keys(row).forEach(k => {
          cleanRow[k.trim().toLowerCase().replace(/[\s_-]+/g, '')] = row[k];
        });

        if (type === 'books') {
          const rawId = cleanRow['bookid'] || cleanRow['id'] || cleanRow['book_id'] || cleanRow['book'] || Object.values(row)[0];
          const rawTitle = cleanRow['title'] || cleanRow['booktitle'] || cleanRow['name'] || Object.values(row)[1];
          const rawAuthor = cleanRow['author'] || cleanRow['authorname'] || cleanRow['writer'] || Object.values(row)[2] || '';

          const customId = rawId ? String(rawId).trim() : null;
          const title = rawTitle ? String(rawTitle).trim() : '';
          const author = rawAuthor ? String(rawAuthor).trim() : '';

          if (!customId || !title) return;

          const lookupKey = customId.toLowerCase();

          if (existingMap.has(lookupKey)) {
            const existingBook = existingMap.get(lookupKey);
            const cleanExistingTitle = (existingBook.title || '').trim().toLowerCase();
            const cleanExistingAuthor = (existingBook.author || '').trim().toLowerCase();

            const isDifferent = (cleanExistingTitle !== title.toLowerCase()) || 
                                (cleanExistingAuthor !== author.toLowerCase());

            if (isDifferent) {
              conflictQueue.push({
                customId,
                title,
                author,
                existing: existingBook
              });
            } else {
              identicalCount++;
            }
          } else {
            resolvedBatch.push({ customId, title, author, action: 'insert' });
          }
        } else {
          // Users
          const rawId = cleanRow['userid'] || cleanRow['id'] || cleanRow['user_id'] || cleanRow['memberid'] || Object.values(row)[0];
          const rawName = cleanRow['name'] || cleanRow['username'] || cleanRow['membername'] || cleanRow['fullname'] || Object.values(row)[1];

          const customId = rawId ? String(rawId).trim() : null;
          const name = rawName ? String(rawName).trim() : '';

          if (!customId || !name) return;

          const lookupKey = customId.toLowerCase();

          if (existingMap.has(lookupKey)) {
            const existingUser = existingMap.get(lookupKey);
            const cleanExistingName = (existingUser.name || '').trim().toLowerCase();

            if (cleanExistingName !== name.toLowerCase()) {
              conflictQueue.push({
                customId,
                name,
                existing: existingUser
              });
            } else {
              identicalCount++;
            }
          } else {
            resolvedBatch.push({ customId, name, action: 'insert' });
          }
        }
      });

      if (conflictQueue.length > 0) {
        currentConflictIndex = 0;
        showConflictModal();
      } else if (resolvedBatch.length > 0) {
        await finalizeBatchUpload();
      } else {
        showToast(`All ${identicalCount} records in this file already match the database exactly.`, 'success');
      }
    } catch (err) {
      console.error('Parsing Error:', err);
      showToast('Error reading Excel: ' + err.message, 'error');
    } finally {
      inputElement.value = '';
    }
  };

  reader.readAsArrayBuffer(file);
}

function showConflictModal() {
  if (currentConflictIndex >= conflictQueue.length) {
    closeModal('modalConflictResolver');
    finalizeBatchUpload();
    return;
  }

  const item = conflictQueue[currentConflictIndex];
  document.getElementById('conflictProgressText').textContent = 
    `Resolving conflict ${currentConflictIndex + 1} of ${conflictQueue.length}`;

  document.getElementById('conflictOldId').textContent = item.existing.id;
  document.getElementById('conflictOldTitle').textContent = item.existing.title || item.existing.name;

  document.getElementById('conflictNewId').textContent = item.customId;
  document.getElementById('conflictNewTitle').textContent = item.title || item.name;

  const oldAuthorRow = document.getElementById('conflictOldAuthorRow');
  const newAuthorRow = document.getElementById('conflictNewAuthorRow');

  if (currentUploadType === 'books') {
    oldAuthorRow.style.display = 'block';
    newAuthorRow.style.display = 'block';
    document.getElementById('conflictOldAuthor').textContent = item.existing.author || 'N/A';
    document.getElementById('conflictNewAuthor').textContent = item.author;
  } else {
    oldAuthorRow.style.display = 'none';
    newAuthorRow.style.display = 'none';
  }

  document.getElementById('modalConflictResolver').classList.add('active');
}

function resolveConflictChoice(choice) {
  if (choice === 'replace') {
    const item = conflictQueue[currentConflictIndex];
    resolvedBatch.push({
      customId: item.customId,
      title: item.title,
      author: item.author,
      name: item.name,
      action: 'replace'
    });
    currentConflictIndex++;
    showConflictModal();
  } else if (choice === 'skip') {
    currentConflictIndex++;
    showConflictModal();
  } else if (choice === 'replace_all') {
    while (currentConflictIndex < conflictQueue.length) {
      const item = conflictQueue[currentConflictIndex];
      resolvedBatch.push({
        customId: item.customId,
        title: item.title,
        author: item.author,
        name: item.name,
        action: 'replace'
      });
      currentConflictIndex++;
    }
    closeModal('modalConflictResolver');
    finalizeBatchUpload();
  } else if (choice === 'skip_all') {
    closeModal('modalConflictResolver');
    finalizeBatchUpload();
  }
}

async function finalizeBatchUpload() {
  if (resolvedBatch.length === 0) {
    showToast('All duplicate records skipped. No changes made.', 'success');
    return;
  }

  showToast(`Saving ${resolvedBatch.length} records to MongoDB...`, 'success');

  try {
    const endpoint = currentUploadType === 'books' 
      ? `${API_BASE}/books/batch-resolve` 
      : `${API_BASE}/users/batch-resolve`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ items: resolvedBatch })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      if (currentUploadType === 'books') {
        closeModal('modalAddBook');
        await loadBooksData();
      } else {
        await loadUsersData();
      }
      await updateMetrics();
    } else {
      showToast(data.message || 'Error processing batch upload', 'error');
    }
  } catch (error) {
    console.error('Batch Save Error:', error);
    showToast('Backend connection failed during batch save: ' + error.message, 'error');
  }
}

// Tab Switcher Logic
function switchDashboardView(tabName) {
  activeDashboardTab = tabName;

  // 1. Tab Buttons Active state
  document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('viewBooksContainer').style.display = 'none';
  document.getElementById('viewUsersContainer').style.display = 'none';
  document.getElementById('viewLogsContainer').style.display = 'none';

  // 2. Filter Dropdowns Toggle
  document.getElementById('containerFilterBooks').style.display = 'none';
  document.getElementById('containerFilterUsers').style.display = 'none';
  document.getElementById('containerFilterLogs').style.display = 'none';

  const searchInput = document.getElementById('txtSearch');

  if (tabName === 'books') {
    document.getElementById('tabViewBooks').classList.add('active');
    document.getElementById('viewBooksContainer').style.display = 'block';
    document.getElementById('containerFilterBooks').style.display = 'block';
    searchInput.placeholder = 'Search by Book ID, Title, Author, Borrower...';
    handleUnifiedSearch();
  } else if (tabName === 'users') {
    document.getElementById('tabViewUsers').classList.add('active');
    document.getElementById('viewUsersContainer').style.display = 'block';
    document.getElementById('containerFilterUsers').style.display = 'block';
    searchInput.placeholder = 'Search by User ID, Member Name, Borrowed Book Title...';
    handleUnifiedSearch();
  } else if (tabName === 'logs') {
    document.getElementById('tabViewLogs').classList.add('active');
    document.getElementById('viewLogsContainer').style.display = 'block';
    document.getElementById('containerFilterLogs').style.display = 'block';
    searchInput.placeholder = 'Search by Action, Details, Timestamp...';
    handleUnifiedSearch();
  }
}

// 1. Books Loader & Renderer
async function loadBooksData() {
  try {
    const res = await fetch(`${API_BASE}/books`);
    if (!res.ok) throw new Error('Books fetch error');
    cachedBooks = await res.json();
    const countBadge = document.getElementById('badgeTotalBooks');
    if (countBadge) countBadge.textContent = cachedBooks.length;
    if (activeDashboardTab === 'books') handleUnifiedSearch();
  } catch (err) {
    console.error(err);
  }
}

function renderBooksTable(list) {
  const tbody = document.getElementById('booksTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">No books found matching search criteria.</td></tr>`;
    return;
  }

  list.forEach(b => {
    let statusHtml = (b.is_issued === 0)
      ? `<span class="status-pill status-available">Available</span>`
      : (b.isOverdue ? `<span class="status-pill status-overdue">Overdue (${b.overdueDays}d)</span>` : `<span class="status-pill status-issued">Active Loan</span>`);

    let fineHtml = b.isOverdue ? `<span class="fine-badge">₹${b.fine}</span>` : `<span style="color:#cbd5e1;">&mdash;</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--primary);">${b.id}</strong></td>
      <td><strong>${b.title}</strong></td>
      <td><span>${b.author}</span></td>
      <td>${statusHtml}</td>
      <td>${b.borrowerName ? `<span>${b.borrowerName}</span> <small style="color:var(--text-muted);">(ID: ${b.issued_to})</small>` : '<span style="color:#cbd5e1;">&mdash;</span>'}</td>
      <td>${b.due_date ? `<strong>${b.due_date}</strong>` : '<span style="color:#cbd5e1;">&mdash;</span>'}</td>
      <td>${fineHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 2. Users Loader & Renderer
async function loadUsersData() {
  try {
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) throw new Error('Users fetch error');
    cachedUsers = await res.json();
    const countBadge = document.getElementById('badgeTotalUsers');
    if (countBadge) countBadge.textContent = cachedUsers.length;
    if (activeDashboardTab === 'users') handleUnifiedSearch();
  } catch (err) {
    console.error(err);
  }
}

function renderUsersTable(list) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">No members registered yet.</td></tr>`;
    return;
  }

  list.forEach(u => {
    const loanBadge = u.issuedCount > 0 
      ? `<span class="status-pill status-issued">${u.issuedCount} Book(s)</span>`
      : `<span class="status-pill status-available">0 Book(s)</span>`;

    const fineDisplay = u.totalFineDue > 0 
      ? `<span style="color:var(--rose); font-weight:700;">₹${u.totalFineDue}</span>` 
      : `<span style="color:var(--emerald); font-weight:600;">₹0</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="color:var(--primary);">${u.id}</strong></td>
      <td><strong>${u.name}</strong></td>
      <td>${loanBadge}</td>
      <td><span style="color:var(--text-muted); font-size:0.88rem;">${u.borrowedTitles}</span></td>
      <td>${fineDisplay}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Logs Loader & Renderer
async function loadLogsData() {
  try {
    const res = await fetch(`${API_BASE}/logs`);
    if (!res.ok) throw new Error('Logs fetch error');
    cachedLogs = await res.json();
    const countBadge = document.getElementById('badgeTotalLogs');
    if (countBadge) countBadge.textContent = cachedLogs.length;
    if (activeDashboardTab === 'logs') handleUnifiedSearch();
  } catch (err) {
    console.error(err);
  }
}

function renderLogsTable(list) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">No audit logs available.</td></tr>`;
    return;
  }

  list.forEach((log, index) => {
    const date = new Date(log.timestamp).toLocaleString();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center; font-weight:bold; color:var(--text-muted);">#${list.length - index}</td>
      <td style="white-space:nowrap; color:var(--text-muted); font-size:0.82rem;">${date}</td>
      <td><span class="status-pill status-issued" style="font-weight:700;">${log.action}</span></td>
      <td><span style="color:var(--text-main);">${log.details}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Unified Search Engine for All 3 Tabs
function handleUnifiedSearch() {
  const query = (document.getElementById('txtSearch').value || '').trim().toLowerCase();

  // 1. BOOKS TAB SEARCH & FILTER
  if (activeDashboardTab === 'books') {
    const filter = document.getElementById('comboFilterBooks').value;
    const filtered = cachedBooks.filter(b => {
      const bName = b.borrowerName ? b.borrowerName.toLowerCase() : '';
      const bId = b.issued_to ? String(b.issued_to).toLowerCase() : '';
      
      const matchText = !query || 
        String(b.id).toLowerCase().includes(query) || 
        b.title.toLowerCase().includes(query) || 
        b.author.toLowerCase().includes(query) || 
        bName.includes(query) ||
        bId.includes(query);

      let matchFilter = true;
      if (filter === 'Available') matchFilter = (b.is_issued === 0);
      if (filter === 'Issued') matchFilter = (b.is_issued === 1 && !b.isOverdue);
      if (filter === 'Overdue') matchFilter = b.isOverdue;

      return matchText && matchFilter;
    });
    renderBooksTable(filtered);
  } 
  
  // 2. MEMBERS TAB SEARCH & FILTER (Book Title Match Included)
  else if (activeDashboardTab === 'users') {
    const userFilter = document.getElementById('comboFilterUsers').value;
    const filtered = cachedUsers.filter(u => {
      const uId = String(u.id || '').toLowerCase();
      const uName = String(u.name || '').toLowerCase();
      const borrowed = String(u.borrowedTitles || '').toLowerCase();

      // Search matches Member ID, Name, or any Book Title borrowed by them
      const matchText = !query || 
        uId.includes(query) || 
        uName.includes(query) || 
        borrowed.includes(query);

      let matchFilter = true;
      if (userFilter === 'ActiveLoans') matchFilter = (u.issuedCount > 0);
      if (userFilter === 'NoLoans') matchFilter = (u.issuedCount === 0);
      if (userFilter === 'HasFine') matchFilter = (u.totalFineDue > 0);

      return matchText && matchFilter;
    });
    renderUsersTable(filtered);
  } 
  
  // 3. AUDIT LOGS TAB SEARCH & FILTER
  else if (activeDashboardTab === 'logs') {
    const logFilter = document.getElementById('comboFilterLogs').value;
    const filtered = cachedLogs.filter(l => {
      const matchText = !query || 
        l.action.toLowerCase().includes(query) || 
        l.details.toLowerCase().includes(query) ||
        new Date(l.timestamp).toLocaleString().toLowerCase().includes(query);

      let matchFilter = true;
      if (logFilter !== 'All') {
        matchFilter = (l.action === logFilter);
      }

      return matchText && matchFilter;
    });
    renderLogsTable(filtered);
  }
}

// Initial Sync
window.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadBooksData(), loadUsersData(), loadLogsData(), updateMetrics()]);
});

// --- 9. PRINT / EXPORT UTILITY ---
function printTable(elementId) {
  window.print();
}


// --- APP LAUNCH ---
window.onload = function() {
  initSystem();
};
