import express from 'express'
import fs from 'fs'
import { WebSocketServer } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
// import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import { SpeechClient } from '@google-cloud/speech'
import { Configuration, OpenAIApi } from 'openai'
import { isWithinTokenLimit } from 'gpt-tokenizer/model/text-davinci-003'
import { trimPrompt, parseCompletions } from './openAI/functions.js'
// import { request } from 'http'

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
const streamingLimit = 30000 // 2 minutes in milliseconds. This is the limit we set to restart the connection before the speech api closes it.

let newStream = true

// Timeout that will automatically restart the connection if it is open for too long
let restartTimeoutId = null

// Generate a unique ID for this WebSocket connection
let requestId = uuidv4()

// The endpoint that will be called on the websocket message that contains a payload
let nextEndpointToCall = null

// Name of the file that will be used to store the user config audio
const userConfigAudioFile = 'temp/userConfigAudio.webm'

// OpenAI API configuration
let openai = null

// Hard token limit for OpenAI API under text-davinci-003 model
const openaiHardTokenLimit = 4000

// Soft token limit for OpenAI API under text-davinci-003 model
const openaiSoftTokenLimit = 3000

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
  respondToClient(ws, 201, undefined)

  ws.on('message', (message, isBinary) => {
    message = isBinary ? message : message.toString()
    // If message is a json object, parse it
    console.log('Message received from client:', message)
    console.log('typeof message:', typeof message)
    if (typeof message === 'string') {
      try {
        const messageObj = JSON.parse(message)
        // If the message is a json object, it should have a requestId property
        // if (!messageObj.requestId) {
        //   throw new Error('Message does not contain a requestId property')
        // }
        // const messageRequestId = messageObj.requestId
        // If the message requestId does not match the current requestId, throw an error
        // if (messageRequestId !== requestId) {
        //   throw new Error('Message requestId does not match the current requestId')
        // }
        const action = messageObj.action
        switch (action) {
          // If the action is setEndpoint, set the next endpoint to call
          case 'setEndpoint':
            console.log('setting endpoint')
            const endpoint = messageObj.data
            if (!endpoint) {
              throw new Error('Message is of action: ' + action + ' and does not contain an endpoint property')
            }
            switch (endpoint) {
              case 'putUserConfigAudio':
                console.log('setting endpoint to putUserConfigAudio')
                nextEndpointToCall = 'putUserConfigAudio'
                // Message the client to start sending audio
                respondToClient(ws, 200, requestId, { nextEndpointToCall: nextEndpointToCall })
                break
              case 'streamRecognizeAudio':
                console.log('setting endpoint to streamRecognizeAudio')
                nextEndpointToCall = 'streamRecognizeAudio'
                // Message the client to start sending audio
                respondToClient(ws, 200, requestId, { nextEndpointToCall: nextEndpointToCall })
                break
              default:
                throw new Error('Message is of action: ' + action + ' and contains an invalid endpoint property')
            }
            break
          default:
            throw new Error('Message is of invalid action: ' + action)
        }
      } catch (error) {
        console.log('Error parsing JSON message:', error.message)
        respondToClient(ws, 400, requestId, { error: 'Error parsing JSON message: ' + error.message })
        return
      }
      // console.log('Received message from client:', message)
    }
    // else if message is a blob, process it
    else if (message instanceof Buffer) {
      try {
        // If the endpoint is not set, throw an error
        if (!nextEndpointToCall) {
          throw new Error('nextEndpointToCall is not set')
        }
        const audioBlob = message

        switch (nextEndpointToCall) {
          case 'putUserConfigAudio':
            // If this is the user config audio, we're going to save the audio to the temp folder and then prepend it to all of our session audio to prime the google speech api
            try {
              // if the user config audio file already exists, delete it
              if (fs.existsSync(userConfigAudioFile)) {
                deleteFile(userConfigAudioFile)
              }
              writeBufferToFile(userConfigAudioFile, audioBlob)
              // Reset the endpoint to call
              resetEndpoint()
              respondToClient(ws, 200, requestId)
            } catch (error) {
              console.log('Error writing user config audio to file:', error.message)
              throw new Error('Error writing user config audio to file: ' + error.message)
            }
            break
          case 'streamRecognizeAudio':
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
            break
          default:
            throw new Error('nextEndpointToCall is invalid')
        }
      } catch (error) {
        // Handle JSON parsing error or other processing errors
        console.log('Error processing message:', error.message)
        respondToClient(ws, 400, requestId, { error: 'Error processing message: ' + error.message })
      }
    }
  })

  ws.on('close', () => {
    console.log('WebSocket connection closed.')
    // Close the connection with the speech API
    closeSTTConnection()
    // Reset the endpoint to call
    resetEndpoint()
    // Delete the user config audio file
    if (fs.existsSync(userConfigAudioFile)) {
      deleteFile(userConfigAudioFile)
    }
    if (restartTimeoutId) clearTimeout(restartTimeoutId)
  })
})

/* Helper function to pass responses to the client and track the socket state
 * @param {WebSocket} ws - The websocket connection
 * @param {number} status - The status code to send to the client
 * @param {number} requestId - The requestId to send to the client
 * @param {object} misc - Any other properties to send to the client
 * @returns {void}
 * */
const respondToClient = (ws, status, _requestId, misc) => {
  // Generate a nextRequestId
  const nextRequestId = uuidv4()
  ws.send(JSON.stringify({ status: status, requestId: _requestId, nextRequestId: nextRequestId, ...misc }))
  requestId = nextRequestId
}

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
        // console.log('Prepending header chunk')
        lastAudioInput.unshift(headerChunk)
      }
      // Otherwise, this must be the first restart, so the header chunk is already in the lastAudioInput array
      else {
        requiresHeaderChunk = true
      }
      //console.log('lastAudioInput.length !== 0', lastAudioInput.length)
      for (let i = 0; i < lastAudioInput.length; i++) {
        //console.log('Pushing leftover chunk')
        recognizeStream.write(lastAudioInput[i])
        // Write the audio chunk to the audio file
        writeBufferToFile('bufferSamp.webm', lastAudioInput[i])
      }
      newStream = false
    }
    // Store the audio chunk in the audioInput array
    audioInput.push(audioChunk)

    if (recognizeStream) {
      // Write the audio chunk to the streaming request
      //console.log('Pushing new chunk')
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
        respondToClient(client, 500, requestId, { error: 'Error contacting services, message: ' + error.message })
      })
    })
    .on('data', speechCallback)
}

const speechCallback = async (res) => {
  // console.log('Data:', res)
  //console.log('Received data from speech api.')
  if (res.results.length > 0) {
    const result = res.results[0]
    //console.log('resultEndTime: ', result.resultEndTime)
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
        completions = await getCompletions(finalTranscript)
        console.log('Completions:', completions)
      }
      const data = {
        isFinal: result.isFinal,
        transcript: transcript,
        completions: completions,
      }
      wss.clients.forEach((ws) => {
        respondToClient(ws, 200, requestId, { data: data })
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
const restartRecognizeStream = () => {
  //console.log('Restarting recognize stream.')
  closeRecognizeStream()

  //console.log('audioInput.length: ', audioInput.length)
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
      //console.log('Undefined word:', word)
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

    // Create the prompt
    let prompt =
      completionsContext +
      transcript +
      '[Continue the conversation as SPEAKER 1 and write a list of the 3 most important and salient questions SPEAKER 1 would ask next and return them in an array]'

    //check if prompt exceeds out max soft token limit
    if (!isWithinTokenLimit(prompt, openaiSoftTokenLimit)) {
      console.log('Prompt exceeds soft token limit, trimming prompt')
      prompt = trimPrompt(prompt, openaiSoftTokenLimit)
      console.log('Trimmed prompt:', prompt)
    }

    const responseObj = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      temperature: 0.5,
      max_tokens: 60,
      top_p: 1,
      frequency_penalty: 0.5,
      presence_penalty: 0,
      stop: ['[SPEAKER 1]', '[SPEAKER 2]', '4.'],
    })
    //console.log('Response:', responseObj)
    const completionsStr = responseObj.data.choices[0].text
    //console.log('Completions:', completionsStr)
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

// Helper function to delete a file
const deleteFile = (fileName) => {
  fs.unlink(fileName, (err) => {
    if (err) {
      console.error(err)
      return
    }
    //file removed successfully
  })
}

//Helper to reset state of the nextEndpointToCall
const resetEndpoint = () => {
  nextEndpointToCall = null
}
