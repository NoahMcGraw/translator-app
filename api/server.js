import express from 'express'
import fs from 'fs'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
// import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import { SpeechClient } from '@google-cloud/speech'
import { Configuration, OpenAIApi } from 'openai'
import { parseCompletions } from './utils.js'

// Load environment variables from .env file
dotenv.config()

// Create express app
const app = express()

const server = app.listen(3003, () => {
  console.log('Server is listening on port 3003.')
})

const wss = new WebSocketServer({ server })

let speechClient = null
let recognizeStream = null
let isFirstAudioChunk = true
let headerChunk = null
let requiresHeaderChunk = false
const hardStreamingLimit = 290000 // ~5 minutes in milliseconds. This limit is set by the speech api. If the connection is open for longer than this, it will close.
const streamingLimit = 10000 // 2 minutes in milliseconds. This is the limit we set to restart the connection before the speech api closes it.

let newStream = true

// Timeout that will automatically restart the connection if it is open for too long
let restartTimeoutId = null

// Generate a unique ID for this WebSocket connection
let requestId = uuidv4()

let openai = null

// Audio buffer array containing the audio chunks sent during the current connection period with the speech api
let audioInput = []

// Audio buffer array containing the audio chunks sent during the last connection period with the speech api
let lastAudioInput = []

// Counter tracking the number of restarts that have occured on the speech api connection
let restartCounter = 0

// String that will store the context of the conversation.
// For now, it is hardcoded to a conversation between two people. This filler text will be replaced with the actual conversation after the initial message is sent.
let completionsContext = ''

// Index of the next word in the conversation to be sent to the completions api
let nextWordIndex = 0

wss.on('connection', (ws) => {
  console.log('WebSocket connection established.')

  //Send the unique ID to the client so it can be used to match responses to requests
  ws.send(JSON.stringify({ status: 201, nextRequestId: requestId, requestId: undefined }))

  ws.on('message', (message) => {
    // console.log('Received message from client:', message)

    try {
      const audioBlob = message

      //If this is the first audio chunk, store it as the header chunk (This is a crude way of handling the header chunk. It will need to be improved.)
      //TODO: Improve handling of header chunk
      if (isFirstAudioChunk) {
        headerChunk = audioBlob
        isFirstAudioChunk = false
      }

      // console log the endpoint, requestId, and data
      // console.log('Request ID:', requestId)
      // console.log('Data:', audioBlob)

      // Process the data payload
      sendAudioChunk(audioBlob)
    } catch (error) {
      // Handle JSON parsing error or other processing errors
      console.log('Error processing message:', error.message)
      ws.send(
        JSON.stringify({ status: 400, requestId: requestId, error: 'Error processing message: ' + error.message })
      )
    }
  })

  ws.on('close', () => {
    console.log('WebSocket connection closed.')
    // Close the connection with the speech API
    closeSTTConnection()
    if (restartTimeoutId) clearTimeout(restartTimeoutId)
  })
})

const sendAudioChunk = async (audioChunk) => {
  try {
    // Create a new speech client if one does not exist
    if (!speechClient) speechClient = await createSpeechClient()
    // Create a new recognize stream if one does not exist
    if (!recognizeStream) recognizeStream = await createRecognizeStream()
    //store the audio chunk in the audioInput array
    // audioInput.push(audioChunk)
    if (newStream && lastAudioInput.length !== 0) {
      // If requiresHeaderChunk is true, prepend the header chunk to the lastAudioInput array
      if (requiresHeaderChunk) {
        console.log('Prepending header chunk')
        lastAudioInput.unshift(headerChunk)
      }
      // Otherwise, this must be the first restart, so the header chunk is already in the lastAudioInput array
      else {
        requiresHeaderChunk = true
      }
      console.log('lastAudioInput.length !== 0', lastAudioInput.length)
      for (let i = 0; i < lastAudioInput.length; i++) {
        console.log('Pushing leftover chunk')
        recognizeStream.write(lastAudioInput[i])
        // Write the audio chunk to the audio file
        writeBufferToFile('bufferSamp.webm', lastAudioInput[i])
      }
      newStream = false
    }
    // Store the audio chunk in the audioInput array
    const audioInputLength = audioInput.push(audioChunk)
    console.log('audioInputLength:', audioInputLength)

    if (recognizeStream) {
      // Write the audio chunk to the streaming request
      console.log('Pushing new chunk')
      recognizeStream.write(audioChunk)
    }

    // Write the audio chunk to the streaming request
    // recognizeStream.write(audioChunk)
  } catch (error) {
    console.error('Error sending audio chunk:', error)
  }
}

// Creates new speech client
const createSpeechClient = async () => {
  // Creates a client
  const newSpeechClient = new SpeechClient()
  // return newSpeechClient.initialize()
  return newSpeechClient
}

// Creates new recognize stream
const createRecognizeStream = async () => {
  console.log('Creating new recognize stream.')
  // Configure the streaming request
  const request = {
    config: {
      model: 'video',
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      audioChannelCount: 1,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 3,
      },
    },
    interimResults: true, // Enable interim (partial) results
  }

  restartTimeoutId = setTimeout(restartRecognizeStream, streamingLimit)

  // If a speech client does not exist, create one
  if (!speechClient) speechClient = await createSpeechClient()

  // Start the streaming recognition
  // console.log(typeof speechClient.streamingRecognize)
  return speechClient
    .streamingRecognize(request)
    .on('error', (error) => {
      console.error('Error:', error)
      // return a message to the client indicating an error
      wss.clients.forEach((client) => {
        client.send(
          JSON.stringify({
            status: 500,
            requestId: requestId,
            nextRequestId: null,
            error: 'Error contacting services, message: ' + error.message,
          })
        )
      })
    })
    .on('data', speechCallback)
}

const speechCallback = (res) => {
  // console.log('Data:', res)
  console.log('Received data from speech api.')
  if (res.results.length > 0) {
    const result = res.results[0]
    console.log('resultEndTime: ', result.resultEndTime)
    // Convert API result end time from seconds + nanoseconds to milliseconds
    // resultEndTime = result.resultEndTime.seconds * 1000 + Math.round(result.resultEndTime.nanos / 1000000)
    // console.log('Result:', result)
    // Grab the transcript and wordsInfo from the result
    let transcript = result.alternatives[0].transcript
    console.log('Transcript:', transcript)
    const wordsInfo = result.alternatives[0].words
    // Initialize the completions array
    let completions = []
    // Note: The transcript within each result is separate and sequential per result.
    // However, the words list within an alternative includes all the words
    // from all the results thus far. Thus, to get all the words with speaker
    // tags, you only have to take the words list from the last result:
    // wordsInfo.forEach((a) => console.log(` word: ${a.word}, speakerTag: ${a.speakerTag}`))

    // If isFinal=true and there is new data to submit, then generate the final transcript and send it to the completions api
    if (result.isFinal) {
      if (typeof wordsInfo[nextWordIndex] !== 'undefined') {
        // TODO: write logic where if our current transcript is the same as the previous transcript, then don't send it to the completions api. For some reason the speech api is sending duplicate transcripts marked as final.
        // Generate the final transcript
        const finalTranscript = createTranscript(wordsInfo)
        console.log('Final Transcription:', finalTranscript)
        // Override the transcript with the final transcript
        transcript = finalTranscript
        // Get the completions
        // completions = await getCompletions(finalTranscript)
        console.log('Completions:', completions)
      }
      const data = {
        isFinal: result.isFinal,
        transcript: transcript,
        completions: completions,
      }
      // Generate a new unique ID for the next request
      const nextRequestId = uuidv4()
      wss.clients.forEach((client) => {
        client.send(JSON.stringify({ status: 200, requestId: requestId, nextRequestId: nextRequestId, data: data }))
      })
    }
  }
}

const closeSTTConnection = () => {
  // Close the connection with the speech API
  closeRecognizeStream()
  // Close the speech client
  closeSpeechClient()
}

// Helper function for closing the connection with the speech API
const closeRecognizeStream = () => {
  if (recognizeStream) {
    recognizeStream.end()
    recognizeStream.removeAllListeners()
    recognizeStream = null
    console.log('RecognizeStream closed.')
  }
}

// Helper function for closing the speech client
const closeSpeechClient = () => {
  if (speechClient) {
    speechClient.close()
    // speechClient.end()
    speechClient = null
    console.log('SpeechClient closed.')
  }
}

// Helper function for restarting the stream every streamingLimit milliseconds
function restartRecognizeStream() {
  console.log('Restarting recognize stream.')
  closeRecognizeStream()

  console.log('audioInput.length: ', audioInput.length)
  lastAudioInput = []
  lastAudioInput = audioInput
  audioInput = []

  restartCounter++

  newStream = true
}

// Helper function for creating a transcript from the words array returned by the speech API
const createTranscript = (words) => {
  let transcript = ''
  let currentSpeaker = 1
  let currentWord = ''
  // Loop through the words array and create a transcript with speaker tags
  // Start at nextWordIndex because we don't want to include the words from previous messages
  for (let i = nextWordIndex; i < words.length; i++) {
    const word = words[i]
    // If the word is undefined, then break out of the loop
    if (typeof word === 'undefined') {
      console.log('Undefined word:', word)
      break
    }
    // If the speakerTag is the same as the currentSpeaker, then add the word to the currentWord
    if (word.speakerTag === currentSpeaker) {
      currentWord = currentWord + ' ' + word.word
    } else {
      // If the speakerTag is different than the currentSpeaker, then add the currentWord to the transcript and update the currentSpeaker and currentWord
      transcript = transcript + 'Speaker ' + currentSpeaker + ': ' + currentWord + '\n'
      currentSpeaker = Number(word.speakerTag)
      currentWord = word.word
    }
    // Update the nextWordIndex
    nextWordIndex = i + 1
  }
  if (currentWord.length > 0) {
    transcript = transcript + 'Speaker ' + currentSpeaker + ': ' + currentWord + '\n'
  }
  return transcript
}

const getCompletions = async (transcript) => {
  if (!openai) {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })

    openai = new OpenAIApi(configuration)
  }

  // If there is no context yet, then we need to grab the example context from completionsContext.json and then overwrite it with actual conversation history later
  // let overwriteContext = false
  let response = []

  try {
    // If there is no context yet, then grab the example context from completionsContext.json
    if (completionsContext === '') {
      const completionsContextJSON = fs.readFileSync('completionsContext.json', 'utf8')
      try {
        completionsContext = JSON.parse(completionsContextJSON).text
      } catch (error) {
        console.error('Error parsing completionsContextJSON:', error)
        throw new Error('Error parsing completionsContextJSON')
      }
    }
    const responseObj = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt:
        completionsContext +
        transcript +
        '[Continue the conversation as SPEAKER 1 and write a list of the 3 most important and salient questions SPEAKER 1 would ask next and return them in an array]',
      temperature: 0.5,
      max_tokens: 60,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
      stop: ['[SPEAKER 1]', '[SPEAKER 2]', '4.'],
    })
    console.log('Response:', responseObj)
    const completionsStr = responseObj.data.choices[0].text
    console.log('Completions:', completionsStr)
    // Add the transcript to the completions context
    completionsContext += transcript
    // Parse the completions string into an array and trim out any non-standard characters
    try {
      response = parseCompletions(completionsStr)
    } catch (error) {
      console.error('Error parsing completions:', error)
    }

    // console.log('Response:', response)
  } catch (error) {
    console.log(error)
    throw new Error(error)
  }

  return response
}

// Helper function to write buffer to file
const writeBufferToFile = (fileName, buffer) => {
  // If the file already exists, then add to it. This function will create the file for us if it doesn't exist.
  fs.appendFile(fileName, buffer, (err) => {
    if (err) {
      console.error(err)
      return
    }
    //file written successfully
  })
}
