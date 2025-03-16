const express = require('express');
const cors = require('cors')
const app = express();
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const nodemailer = require('nodemailer');
const port = process.env.PORT || 5000;
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
const iv = crypto.randomBytes(16);

// Encrypt function
function encrypt(text) {
    const iv = crypto.randomBytes(16); // ✅ Generate a new IV each time
    let cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// Decrypt function
function decrypt(text) {
    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');

        let decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted.toString();
    } catch (error) {
        console.error('Decryption failed:', error.message);
        return null;
    }
}
//MIDDLEWARE
app.use(cors({
    origin: ['http://localhost:5173', 'https://medventure-9cc22.web.app', 'https://medventure-9cc22.firebaseapp.com']
}));
app.use(express.json());
app.use(cookieParser())

const verifyToken = (req, res, next) => {
    // console.log('inside verify token', req.headers)
    if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' })
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next()
    })

}

// AvishekRoy JbDmmHI7BojprzkP
// Add this token to env file
// ACCESS_TOKEN_SECRET=a6e7f2636c2f57f8cbbc9dfdc7f0effd8b75f56bfdc2143b762dbe70690efad60ed2ef1aa763e524f6b925521413f8315bd4347ed9d0f1899aa0abe8dc8efa29
// lade hbim lhyz hrcg




// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster1.hauko36.mongodb.net/?retryWrites=true&w=majority&appName=Cluster1`;
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dop0c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dop0c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,  // Add to .env file
        pass: process.env.EMAIL_PASS   // Add to .env file
    }
});

async function run() {
    try {
        // app.post('/jwt', async (req, res) => {
        //     const user = req.body;
        //     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        //         expiresIn: '1h'
        //     })
        //     res.send({ token });
        // })
        // app.post('/logout', async (req, res) => {
        //     res
        //         .clearCookie('token', {
        //             ...cookieOptions, maxAge: 0,
        //         })
        //         .send({ success: true })
        // })

        // Connect the client to the server	(optional starting in v4.7)
        const passwordCollection = client.db('Password_Manager').collection('password');
        const otpCollection = client.db('Password_Manager').collection('otps');

        app.post('/send-otp', async (req, res) => {
            const { email } = req.body;
            console.log('otp for email', email)
            await otpCollection.deleteMany({ email });


            // Generate a 6-digit OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // OTP expires in 5 minutes

            // Store OTP in database
            await otpCollection.insertOne({ email, otp, expiresAt });

            // Send OTP via email
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: 'Your OTP Code',
                text: `Your OTP code is: ${otp}. It will expire in 5 minutes.`
            };
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    return res.status(500).send({ message: 'Failed to send OTP' });
                }
                res.send({ message: 'OTP sent successfully' });
            });
        });

        app.post('/verify-otp', async (req, res) => {
            const { email, otp } = req.body;

            console.log('email-', email)
            console.log('otp-', otp)

            // Find the OTP in the database
            const storedOtp = await otpCollection.findOne({ email });

            if (!storedOtp) {
                return res.status(400).send({ message: 'OTP not found. Please request a new one.' });
            }

            if (storedOtp.otp !== otp) {
                return res.status(400).send({ message: 'Invalid OTP' });
            }

            if (new Date() > storedOtp.expiresAt) {
                return res.status(400).send({ message: 'OTP expired' });
            }

            // OTP is valid, generate JWT token
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            // Delete OTP after verification
            await otpCollection.deleteOne({ email });

            res.send({ token });
        });


        app.post('/saveCredentials',verifyToken, async (req, res) => {
            const addedItem = req.body;
            if (addedItem.platform_password) {
                addedItem.platform_password = encrypt(addedItem.platform_password);
            }
            const result = await passwordCollection.insertOne(addedItem);
            res.send(result)
        })
        app.get('/myCredentials/:email',verifyToken, async (req, res) => {
            const email = req.params.email;
            console.log('email', email)
            const query = { user_email: email }
            const result = await passwordCollection.find(query).toArray()
            result.forEach(item => {
                if (item.platform_password) {

                    item.platform_password = decrypt(item.platform_password);
                }
            });

            res.send(result)
        })

        app.get('/selectedPlatform/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await passwordCollection.findOne(query)
            if (result.platform_password) {
                result.platform_password = decrypt(result.platform_password);
            }

            console.log('result', result)
            res.send(result)
        })

        app.put('/updateCredentials/:id',verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true }
            const updateInfo = req.body;
            const item = {
                $set: {
                    platform_name: updateInfo.platform_name,
                    platform_owner: updateInfo.platform_owner,
                    platform_email: updateInfo.platform_email,
                    platform_password: encrypt(updateInfo.platform_password)
                }
            }
            const result = await passwordCollection.updateOne(filter, item, options)
            res.send(result)
        })

        app.delete('/deletePlatformCredentials/:id',verifyToken, async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await passwordCollection.deleteOne(query)
            res.send(result)
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Art and craft server is running avishek')
})

app.listen(port, () => {
    console.log(`art craft server running ona: ${port}`)
})