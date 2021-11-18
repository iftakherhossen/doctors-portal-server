const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
const ObjectId = require('mongodb').ObjectId;
const stripe = require('stripe')(process.env.STRIPE_SECRET)
const fileUpload = require('express-fileupload');
const app = express();

app.use(cors());
app.use(express.json());
app.use(fileUpload());

const port = process.env.PORT || 5000;


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wk6ov.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email
        }
        catch {

        }
    }

    next();
}

async function run() {
    try {
        await client.connect();
        const database = client.db('doctorsPortal');
        const servicesCollection = database.collection('services');
        const availableAppointmentsCollection = database.collection('availableAppointments');
        const appointmentsCollection = database.collection('appointments');
        const usersCollection = database.collection('users');
        const reviewsCollection = database.collection('reviews');
        const doctorsCollection = database.collection('doctors');

        // GET Services API
        app.get('/services', async (req, res) => {
            const cursor = servicesCollection.find({});
            const service = await cursor.toArray();
            res.send(service);
        })

        // GET Available Appointments API
        app.get('/availableAppointments', async (req, res) => {
            const cursor = availableAppointmentsCollection.find({});
            const available = await cursor.toArray();
            res.send(available);
        })

        // GET All Appointments API
        app.get('/appointments', async (req, res) => {
            const cursor = appointmentsCollection.find({});
            const appointment = await cursor.toArray();
            res.send(appointment);
        })

        // GET Appointment API With Double Filter
        app.get('/appointments/user', verifyToken, async (req, res) => {
            const email = req.query.email;
            const date = new Date(req.query.date).toLocaleDateString();
            const query = { email: email, date: date };
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        })

        // GET Appointment API With Single Filter
        app.get('/appointments/email', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const cursor = appointmentsCollection.find(query);
            const appointments = await cursor.toArray();
            res.json(appointments);
        })

        // POST Appointment API
        app.post('/appointments', async (req, res) => {
            const appointment = req.body;
            const result = await appointmentsCollection.insertOne(appointment)
            res.json(result)
        })

        // GET Single Appointment API 
        app.get('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const appointmentId = await appointmentsCollection.findOne(query);
            res.json(appointmentId);
        })

        // PUT Single Appointment 
        app.put('/appointments/:id', async(req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    payment: payment
                }
            };
            const result = await appointmentsCollection.updateOne(filter, updateDoc);
            res.json(result);
        })

        // DELETE Appointment API
        app.delete('/appointments/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await appointmentsCollection.deleteOne(query);
            res.json(result);
        })

        // GET Users API
        app.get('/users', async (req, res) => {
            const cursor = usersCollection.find({});
            const user = await cursor.toArray();
            res.json(user);
        })

        // POST Users API
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.json(result)
            console.log(user, result)
        })

        // GET Users API for Admin Role
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin })
        })

        // Update Users
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result)
        })

        // PUT & Verify Admin API
        app.put('/users/admin', verifyToken, async (req, res) => {
            const user = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester })
                if (requesterAccount.role === 'admin') {
                    const filter = { email: user.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'You do not have any access to make an admin!' })
            }
        })

        // Stripe Payment 
        app.post('/create-payment-intent', async (req, res) => {
            const paymentInfo = req.body;
            const amount = paymentInfo.fees * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card']
            });
            res.json({ clientSecret: paymentIntent.client_secret })
        })

        // GET Reviews API
        app.get('/reviews', async (req, res) => {
            const cursor = reviewsCollection.find({});
            const result = await cursor.toArray();
            res.send(result);
        })

        // POST Reviews API
        app.post('/reviews', async (req, res) => {
            const review = req.body;
            const result = await reviewsCollection.insertOne(review);
            res.json(result);
        });

        // GET Single Reviews API 
        app.get('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const reviewId = await reviewsCollection.findOne(query);
            res.json(reviewId);
        })

        // GET Doctor's API
        app.get('/doctors', async (req, res) => {
            const cursor = doctorsCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        });

        // GET Single Doctors API
        app.get('/doctors/:id', async (req, res) => {
            const query = { _id: ObjectId(req.params.id) }
            const result = await doctorsCollection.findOne(query);
            res.json(result);
        });

        // POST Doctor's API
        app.post('/doctors', async (req, res) => {
            const name =req.body.name;
            const email = req.body.email;
            const img = req.files.image;
            const imgData = img.data;
            const encodedImg = imgData.toString('base64');
            const imgBuffer = Buffer.from(encodedImg, 'base64');
            const doctor = {
                name,
                email,
                image: imgBuffer
            }
            const result = await doctorsCollection.insertOne(doctor);
            res.json(result);
        });

        // DELETE Doctors API
        app.delete('/doctors/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(query);
            res.json(result);
        })
    }
    finally {
        // await client.close();
    }
}

run().catch(console.dir)


app.get('/', (req, res) => {
    res.send('Running Doctor`s Portal Server!')
})

app.listen(port, () => {
    console.log('Running Server at', port)
})