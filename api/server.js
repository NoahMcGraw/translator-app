import express from 'express'
import cors from 'cors'
import multer from 'multer'
import axios from 'axios'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Create express app
const app = express()
app.use(cors())

// Set up multer for file uploads
const upload = multer()

app.post('/getTranslations', upload.single('file'), async (req, res) => {
  // Extract the model property from the body of the request.
  const model = req.body.model
  // Extract the audio buffer from the request so it can be passed to the next api.
  const audioBuffer = new Blob([req.file.buffer], { type: 'audio/webm' })

  // Check if the required fields are present in the request body
  if (!audioBuffer || !model) {
    return res.status(400).json({ error: 'Missing required fields.' })
  }

  // Create and then populate the request FormData object with the data to send to the API.
  const requestData = new FormData()
  requestData.append('file', audioBuffer, 'audio.webm')
  requestData.append('model', model)

  // Perform translation logic here using the file and model
  const config = {
    method: 'post',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      // TODO: Replace with your API key
      Accept: '*/*',
    },
    data: requestData,
  }

  return await axios(config)
    .then(function (extResponse) {
      return res.status(200).json({ message: 'Translation complete.', data: extResponse.data })
    })
    .catch(function (error) {
      console.error(error)
      return res.status(500).json({ message: 'Error during translation.', data: JSON.stringify(error) })
    })
})

app.listen(3003, () => {
  console.log('Server is listening on port 3003.')
})
