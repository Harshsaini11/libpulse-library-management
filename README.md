# 📚 LibPulse • Library Management Web Application

**LibPulse** is a modern, responsive full-stack web application designed to simplify book cataloging, member registration, automated loan duration tracking, late-fee penalties, and activity audit logging.

Live link : [https://libpulse-library-management-xw72.onrender.com]

---

## ✨ Key Features

- **📖 Book Inventory Management:** Add, edit, issue, return, and delete books in real time.
- **⚡ Automated Fine System:** Real-time overdue date tracking with dynamic daily penalty computation.
- **👥 Member Directory:** Manage registered users, track individual borrowing limits, and monitor outstanding dues.
- **📊 Interactive Dashboard:** Live inventory counters, member loan statuses, and unified multi-attribute search.
- **📁 Excel Import Integration:** Bulk upload books and member lists via `.xlsx` / `.csv` spreadsheets with built-in duplicate resolution.
- **🖨️ Export & Print Reports:** Clean tabular export and print utilities for catalogs, user logs, and fine records.

---

## 🛠️ Technology Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+ Vanilla JS)
- **Backend:** Node.js, Express.js
- **Database:** MongoDB Atlas & Mongoose ODM
- **File Parsing:** SheetJS (`xlsx`)

---

## 🚀 Local Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) installed (v18 or higher)
- A running MongoDB instance (Local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

### Step-by-Step Setup

1. **Clone the Repository:**
   ```bash
   git clone [https://github.com/Harshsaini11/libpulse-library-management.git](https://github.com/Harshsaini11/libpulse-library-management.git)
   cd libpulse-library-app
Install Dependencies:

Bash
npm install
Configure Environment Variables:
Create a .env file in the root directory and add your credentials:

Code snippet
PORT=5000
MONGO_URI=your_mongodb_connection_string
Run the Application:

Bash
npm start
Open in Browser:
Navigate to http://localhost:5000

👨‍💻 Developer
Harsh Kumar Saini

GitHub: @Harshsaini11

LinkedIn: https://www.linkedin.com/in/harsh-saini-317827297/

📄 License
This project is open-source and available under the MIT License.
