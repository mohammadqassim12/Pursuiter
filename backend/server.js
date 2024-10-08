import express from "express"; // Express.js framework
import { MongoClient, ObjectId } from "mongodb"; // MongoDB Node.js driver
import bcrypt from "bcrypt"; // Password hashing library
import cors from "cors"; // Cross-origin resource sharing middleware
import mongoose from "mongoose"; // Mongoose library
import dotenv from "dotenv"; // Dotenv library
import GeminiService from "./geminiService.js"; // Import the GeminiService
import { OAuth2Client } from 'google-auth-library'; // Google OAuth2 client

const env = process.env.NODE_ENV || "development";
dotenv.config({ path: `.env.${env}` });

const app = express();
const PORT = process.env.PORT;
console.log("PORT", PORT);
const mongoURL ="mongodb+srv://mohammadqassim000:xVTcVQ2a7IA3HL0C@cluster0.s77zm.mongodb.net/";
const dbName = process.env.DB_NAME || "pursuiter";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

let db;

/************************************
 * MongoDB Connection
 *************************************/

// Connect to MongoDB
async function connectToMongo() {
  try {
    await mongoose.connect(mongoURL, {
      dbName,
    });
    console.log("Connected to MongoDB");
    return mongoose.connection;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Middleware to connect to MongoDB
app.use(async (req, res, next) => {
  if (!db) {
    try {
      db = await connectToMongo();
    } catch (error) {
      return res
        .status(500)
        .json({ message: "Error connecting to the database" });
    }
  }
  req.db = db;
  next();
});

// Start the server
async function startServer() {
  db = await connectToMongo();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();

// Verify Google ID Token
async function verifyToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return payload;
}


/************************************
 * Gemini API Endpoints
 *************************************/

/**
 * @route POST /generateResponse
 * @description Generate a response to a prompt
 * @access private
 */
app.post("/generateResponse", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(500).json({ message: "Prompt is required" });
  }

  try {
    const response = await GeminiService.generateResponse(prompt);
    res.status(200).json({ response });
  } catch (error) {
    console.error("Error generating response");
    res.status(500).json({ message: error.message });
  }
});

/************************************
 * User API Endpoints
 *************************************/

/**
 * @route POST /signup
 * @description Register a new user
 * @access public
 */
app.post("/signup", async (req, res) => {
  const {
    userType,
    email,
    password,
    fullName,
    companyName,
    companyAccessCode,
    address,
    positions,
    masterResume,
  } = req.body;
  try {
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }
    if (companyName) {
      const companyUser = await db.collection("users").findOne({ companyName });
      if (companyUser && companyUser.companyAccessCode !== companyAccessCode) {
        return res.status(400).json({ message: "Invalid access code for that company" });
      }
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      userType,
      email,
      password: hashedPassword,
      fullName,
      companyName,
      companyAccessCode,
      address,
      positions,
      favorites: [],
      masterResume,
      createConfirm: true,
    };
    const result = await db.collection("users").insertOne(newUser);
    res
      .status(201)
      .json({ message: "User created", userId: result.insertedId });
  } catch (error) {
    console.error("Error in signup:", error);
    res.status(500).json({ message: "Error creating user" });
  }
});

/**
 * @route POST /login
 * @description Login a user
 * @access public
 */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db.collection("users").findOne({ email });
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        message: "Login successful",
        userType: user.userType,
        email: user.email,
        fullName: user.fullName,
        companyName: user.companyName,
        companyAccessCode: user.companyAccessCode,
        address: user.address,
        positions: user.positions,
        userId: user._id,
        favorites: user.favorites || [],
        createConfirm: user.createConfirm,
      });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error logging in" });
  }
});

/**
 * @route POST /auth/google-signup
 * @description Register a new user using Google
 * @access public
 */
app.post('/api/auth/google-signup', async (req, res) => {
  try {
    const { idToken, userType } = req.body;
    const payload = await verifyToken(idToken);

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;

    let user = await db.collection('users').findOne({ email });
    if (user) {
      if (user.userType !== userType) {
        return res.status(400).json({
          message: `This email is already associated with a different user type (${user.userType}). Please use the login page.`,
        });
      }
      if (!user.googleId) {
        await db.collection('users').updateOne(
          { email },
          { $set: { googleId, fullName: name } }
        );
      }
      return res.status(200).json({
        message: 'User already exists, please log in.',
        userId: user._id,
        userType: user.userType,
      });
    } else {
      user = {
        googleId: googleId,
        email,
        fullName: name,
        userType,
        companyName: '',
        address: '',
        positions: '',
        favorites: [],
        createConfirm: true,
      };
      const result = await db.collection('users').insertOne(user);
      user._id = result.insertedId;
      res.status(201).json(user);
    }
  } catch (error) {
    console.error('Google Signup error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * @route POST /auth/google-login
 * @description Login a user using Google
 * @access public
 */
app.post('/api/auth/google-login', async (req, res) => {
  try {
    const { idToken } = req.body;
    const payload = await verifyToken(idToken);
    const { sub: googleId, email, name} = payload;

    let user = await db.collection('users').findOne({ $or: [{ googleId }, { email }] });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.googleId) {
      await db.collection('users').updateOne(
        { email },
        { $set: { googleId, fullName: name } }
      );
      user = await db.collection('users').findOne({ email });
    }

    res.json({
      message: "Login successful",
      userType: user.userType,
      email: user.email,
      fullName: user.fullName,
      companyName: user.companyName,
      address: user.address,
      positions: user.positions,
      userId: user._id,
      favorites: user.favorites || [],
      createConfirm: user.createConfirm,
    });
  } catch (error) {
    console.error('Google Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


/**
 * @route POST /verifyAccessCode
 * @description Verify company access code
 * @access private
 */
app.post("/verifyAccessCode", async (req, res) => {
  const { companyName, companyAccessCode } = req.body;
  try {
      if (companyName) {
        const companyUser = await db.collection("users").findOne({ companyName });
        if (companyUser && companyUser.companyAccessCode !== companyAccessCode) {
          return res.status(400).json({ message: "Invalid access code for that company" });
        }
      }
      res.status(200).json({ message: "Access code verified" });
  } catch (error) {
    console.error("Error verifying access code:", error);
    res.status(500).json({ message: "Error verifying access code" });
  }
});

/**
 * @route GET /user/:id
 * @description Fetch user information
 * @access private
 */
app.get("/user/:id", async (req, res) => {
  const userId = req.params.id;
  if (!ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }
  try {
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });
    if (user) {
      res.json({
        userType: user.userType,
        email: user.email,
        fullName: user.fullName,
        companyName: user.companyName,
        companyAccessCode: user.companyAccessCode,
        address: user.address,
        positions: user.positions,
        userId: user._id,
        favorites: user.favorites || [],
        masterResume: user.masterResume,
        createConfirm: user.createConfirm,
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error fetching user information" });
  }
});

/**
 * @route PUT /updateUser
 * @description Update user information
 * @access private
 */
app.put("/updateUser", async (req, res) => {
  const {
    email,
    newEmail,
    fullName,
    address,
    positions,
    companyName,
    companyAccessCode,
    userType,
    masterResume,
    createConfirm,
  } = req.body;
  try {
    const user = await db.collection("users").findOne({ email });
    if (user) {
      const updatedUser = { ...user };
      if (newEmail) {
        const emailUsed = await db
          .collection("users")
          .findOne({ email: newEmail });
        if (emailUsed && newEmail !== email) {
          return res
            .status(400)
            .json({ message: "New email already used by another account" });
        } else {
          updatedUser.email = newEmail;
        }
      }
      if (fullName) updatedUser.fullName = fullName;
      if (address) updatedUser.address = address;
      if (positions) updatedUser.positions = positions;
      if (companyName) updatedUser.companyName = companyName;
      if (companyAccessCode) updatedUser.companyAccessCode = companyAccessCode;
      if (userType) updatedUser.userType = userType;
      if (masterResume) updatedUser.masterResume = masterResume;
      if (createConfirm !== undefined)
        updatedUser.createConfirm = createConfirm;
      await db.collection("users").updateOne({ email }, { $set: updatedUser });
      res.json({
        message: "Update successful",
        fullName: updatedUser.fullName,
        address: updatedUser.address,
        email: updatedUser.email,
        positions: updatedUser.positions,
        companyName: updatedUser.companyName,
        companyAccessCode: updatedUser.companyAccessCode,
        userType: updatedUser.userType,
        masterResume: updatedUser.masterResume,
        createConfirm: updatedUser.createConfirm,
      });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating user" });
  }
});

/**
 * @route DELETE /user/:id
 * @description Delete a user
 * @access private
 */
app.delete("/user/:id", async (req, res) => {
  const userId = req.params.id;
  try {
    const result = await db
      .collection("users")
      .deleteOne({ _id: new ObjectId(userId) });
    if (result.deletedCount === 1) {
      res.status(200).json({ message: "User deleted!" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error deleting user" });
  }
});

/************************************
 * Job API Endpoints
 *************************************/

/**
 * @route GET /jobs
 * @description Fetch all jobs
 * @access private
 */
app.get("/jobs", async (req, res) => {
  try {
    const jobs = await db.collection("jobs").find().toArray();
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching jobs" });
  }
});

/**
 * @route GET /jobs/:id
 * @description Fetch job details
 * @access private
 */
app.get("/jobs/:id", async (req, res) => {
  const jobId = req.params.id;
  try {
    const job = await db
      .collection("jobs")
      .findOne({ _id: new ObjectId(jobId) });
    if (job) {
      res.json(job);
    } else {
      res.status(404).json({ message: "Job not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Error fetching job details" });
  }
});

/**
 * @route POST /jobs/add
 * @description Add a new job
 * @access private
 */
app.post("/jobs/add", async (req, res) => {
  const job = req.body;

  if (!job || typeof job !== "object") {
    return res.status(400).json({ message: "Expected a job object" });
  }
  try {
    const result = await db.collection("jobs").insertOne(job);
    res
      .status(201)
      .json({ message: "Job added!", insertedId: result.insertedId });
  } catch (error) {
    console.error("Error adding job:", error);
    res.status(500).json({ message: "Error adding job", error: error.message });
  }
});

/**
 * @route PUT /jobs/:id
 * @description Update a job
 * @access private
 */
app.put("/jobs/:id", async (req, res) => {
  const jobId = req.params.id;
  const job = req.body;
  const lastEditedBy = job.lastEditedBy;
  if (!ObjectId.isValid(jobId)) {
    return res.status(400).json({ message: "Invalid job ID" });
  }
  try {
    const result = await db
      .collection("jobs")
      .updateOne({ _id: new ObjectId(jobId) }, { $set: { ...job, lastEditedBy: lastEditedBy } });
    if (result.modifiedCount === 1) {
      res.json({ message: "Job updated", job });
    } else {
      res.status(404).json({ message: "Job not found" });
    }
  } catch (error) {
    console.error("Error updating job:", error);
    res
      .status(500)
      .json({ message: "Error updating job", error: error.message });
  }
});

/**
 * @route DELETE /jobs/:id
 * @description Delete a job
 * @access private
 */
app.delete("/jobs/:id", async (req, res) => {
  const jobId = req.params.id;
  try {
    const result = await db
      .collection("jobs")
      .deleteOne({ _id: new ObjectId(jobId) });
    if (result.deletedCount === 1) {
      res.status(200).json({ message: "Job deleted!" });
    } else {
      res.status(404).json({ message: "Job not found" });
    }
  } catch (error) {
    console.error("Error deleting job:", error);
    res.status(500).json({ message: "Error deleting job" });
  }
});

/************************************
 * Application API Endpoints
 *************************************/

/**
 * @route POST /applications/add
 * @description Add a new application
 * @access private
 */
app.post("/applications/add", async (req, res) => {
  const application = req.body;

  if (!application || typeof application !== "object") {
    return res.status(400).json({ message: "Expected an application object" });
  }

  application.status = "Pending Review"; // default status

  try {
    const result = await db.collection("applications").insertOne(application);
    res
      .status(201)
      .json({ message: "Application added!", insertedId: result.insertedId });
  } catch (error) {
    console.error("Error adding application:", error);
    res
      .status(500)
      .json({ message: "Error adding application", error: error.message });
  }
});

/**
 * @route PUT /applications/:applicantID/:jobID/status
 * @description Update application status
 * @access private
 */
app.put("/applications/:applicantID/:jobID/status", async (req, res) => {
  const { applicantID, jobID } = req.params;
  const { status } = req.body;

  try {
    const result = await db
      .collection("applications")
      .updateOne({ applicantID, jobID }, { $set: { status } });

    if (result.modifiedCount === 1) {
      res.json({ message: "Application status updated", status });
    } else {
      res.status(404).json({ message: "Application not found" });
    }
  } catch (error) {
    console.error("Error updating application status:", error);
    res.status(500).json({ message: "Error updating application status" });
  }
});

/**
 * @route GET /applications/:jobId
 * @description Fetch user details of applicants for a job
 * @access private
 */
app.get("/jobs/:id/applicants", async (req, res) => {
  const jobId = req.params.id;
  try {
    const applications = await db
      .collection("applications")
      .find({ jobId: new ObjectId(jobId) })
      .toArray();
    const userIds = applications.map((app) => app.userId);
    const applicants = await db
      .collection("users")
      .find({ _id: { $in: userIds } })
      .toArray();
    res.json(applicants);
  } catch (error) {
    console.error("Error fetching applicants:", error);
    res.status(500).json({ message: "Error fetching applicants" });
  }
});

/**
 * @route GET /applications/:jobId
 * @description Fetch applications for a job
 * @access private
 */
app.get("/applications/:jobId", async (req, res) => {
  const jobId = req.params.jobId;
  try {
    const applications = await db
      .collection("applications")
      .find({ jobID: jobId })
      .toArray();
    if (applications.length === 0) {
      return res
        .status(404)
        .json({ message: "No applications found for this job" });
    }
    const applicantIds = applications.map((app) => app.applicantID);
    const applicants = await db
      .collection("users")
      .find({ _id: { $in: applicantIds.map((id) => new ObjectId(id)) } })
      .toArray();
    const applicantsWithDetails = applicants.map((applicant) => {
      const application = applications.find(
        (app) => app.applicantID === applicant._id.toString(),
      );
      return {
        ...applicant,
        applyDate: application ? application.applyDate : null,
        resumeData: application ? application.resumeData : null,
        coverLetterData: application ? application.coverLetterData : null,
      };
    });
    res.json(applicantsWithDetails);
  } catch (error) {
    console.error("Error fetching applicants:", error);
    res
      .status(500)
      .json({ message: "Error fetching applicants", error: error.message });
  }
});

/**
 * @route GET /applications/details/:applicantID/:jobID
 * @description Fetch specific application details
 * @access private
 */
app.get("/applications/details/:applicantID/:jobID", async (req, res) => {
  const { applicantID, jobID } = req.params;
  try {
    const application = await db.collection("applications").findOne({
      jobID: jobID,
      applicantID: applicantID,
    });
    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json(application);
  } catch (error) {
    console.error("Error fetching application details:", error);
    res.status(500).json({ message: "Error fetching application details" });
  }
});

/**
 * @route GET /applications/user/:userId
 * @description Fetch all applications for a specific user
 * @access private
 */
app.get("/applications/user/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const applications = await db
      .collection("applications")
      .find({ applicantID: userId })
      .toArray();
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/************************************
 * Favorites API Endpoints
 *************************************/

/**
 * @route GET /favorites/:userId
 * @description Fetch favorite jobs for a user
 * @access private
 */
app.get("/favorites/:userId", async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });
    if (user && user.favorites) {
      const favoriteJobs = await db
        .collection("jobs")
        .find({ _id: { $in: user.favorites } })
        .toArray();
      res.status(200).json(favoriteJobs);
    } else {
      res.status(404).json({ message: "User or favorites not found" });
    }
  } catch (error) {
    console.error("Error fetching favorite jobs:", error);
    res.status(500).json({ message: "Error fetching favorite jobs" });
  }
});

/**
 * @route POST /favorites/add
 * @description Add a job to favorites
 * @access private
 */
app.post("/favorites/add", async (req, res) => {
  const { userId, jobId } = req.body;

  try {
    await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $addToSet: { favorites: new ObjectId(jobId) } },
      );
    res.status(200).json({ message: "Job added to favorites" });
  } catch (error) {
    console.error("Error adding to favorites:", error);
    res.status(500).json({ message: "Error adding to favorites" });
  }
});

/**
 * @route POST /favorites/remove
 * @description Remove a job from favorites
 * @access private
 */
app.post("/favorites/remove", async (req, res) => {
  const { userId, jobId } = req.body;

  try {
    await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $pull: { favorites: new ObjectId(jobId) } },
      );
    res.status(200).json({ message: "Job removed from favorites" });
  } catch (error) {
    console.error("Error removing from favorites:", error);
    res.status(500).json({ message: "Error removing from favorites" });
  }
});

export default app;
export { app, connectToMongo };
