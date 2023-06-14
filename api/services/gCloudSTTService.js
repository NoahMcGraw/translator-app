import { SpeechClient } from '@google-cloud/speech'
// import { SpeechClient } from '@google-cloud/speech/build/src/v1p1beta1/speech_client.js'
import fs from 'fs'
import { deleteFile } from '../utils.js'

/**
 * GCloudSTT service class.
 * @class
 * @classdesc GCloudSTT service class.
 * @memberof module:api/services
 */
class GCloudSTTService {
  speechClient = null
  recognizeStream = null
  #isFirstAudioChunk = true
  #headerChunk = null
  #requiresHeaderChunk = false
  hardStreamingLimit = 290000 // ~5 minutes in milliseconds. This limit is set by the speech api. If the connection is open for longer than this, it will close.
  streamingLimit = 30000 // 2 minutes in milliseconds. This is the limit we set to restart the connection before the speech api closes it.

  #newStream = true

  // Timeout that will automatically restart the connection if it is open for too long
  #restartTimeoutId = null

  // Counter tracking the number of restarts that have occured on the speech api connection
  restartCounter = 0

  // Name of the file that will be used to store the user config audio
  userConfigAudioFile = 'temp/userConfigAudio.webm'

  // Audio buffer array containing the audio chunks sent during the current connection period with the speech api
  #audioInput = []

  // Audio buffer array containing the audio chunks sent during the last connection period with the speech api
  #lastAudioInput = []

  // Index of the next word in the conversation to be sent to the completions api
  #nextWordIndex = 0

  constructor() {
    // Init the speech client
    this.createRecognizeStream()
  }

  putUserConfigAudio = async (audioBlob, requestId) => {
    // if the user config audio file already exists, delete it
    if (fs.existsSync(this.userConfigAudioFile)) {
      this.deleteFile(this.userConfigAudioFile)
    }
    this.writeBufferToFile(this.userConfigAudioFile, audioBlob)
  }

  streamRecognizeAudio = async (audioBlob) => {
    //If this is the first audio chunk, store it as the header chunk (This is a crude way of handling the header chunk. It will need to be improved.)
    //TODO: Improve handling of header chunk
    if (this.#isFirstAudioChunk) {
      this.#headerChunk = audioBlob
      this.#isFirstAudioChunk = false
      this.#restartTimeoutId = setTimeout(this.restartRecognizeStream, this.streamingLimit)
    }

    // console log the endpoint, requestId, and data
    // console.log('Request ID:', requestId)
    // console.log('Data:', audioBlob)

    // Process the data payload
    this.#sendAudioChunk(audioBlob)
  }

  #sendAudioChunk = async (audioChunk) => {
    try {
      // Create a new recognize stream if one does not exist
      if (!this.recognizeStream) await this.createRecognizeStream()
      //store the audio chunk in the audioInput array
      // audioInput.push(audioChunk)
      if (this.#newStream && this.#lastAudioInput.length !== 0) {
        // If requiresHeaderChunk is true, prepend the header chunk to the lastAudioInput array
        if (this.#requiresHeaderChunk) {
          // console.log('Prepending header chunk')
          this.#lastAudioInput.unshift(this.#headerChunk)
        }
        // Otherwise, this must be the first restart, so the header chunk is already in the lastAudioInput array
        else {
          this.#requiresHeaderChunk = true
        }
        //console.log('lastAudioInput.length !== 0', lastAudioInput.length)
        for (let i = 0; i < this.#lastAudioInput.length; i++) {
          //console.log('Pushing leftover chunk')
          this.recognizeStream.write(this.#lastAudioInput[i])
          // Write the audio chunk to the audio file
          this.writeBufferToFile('bufferSamp.webm', this.#lastAudioInput[i])
        }
        this.#newStream = false
      }
      // Store the audio chunk in the audioInput array
      this.#audioInput.push(audioChunk)

      if (this.recognizeStream) {
        // Write the audio chunk to the streaming request
        console.log('Pushing new chunk')
        this.recognizeStream.write(audioChunk)
      }

      // Write the audio chunk to the streaming request
      // recognizeStream.write(audioChunk)
    } catch (error) {
      console.error('Error sending audio chunk:', error)
    }
  }

  // Creates new speech client
  #createSpeechClient = () => {
    // Creates a client
    if (!this.speechClient) {
      this.speechClient = new SpeechClient()
    }
  }

  // Creates new recognize stream
  createRecognizeStream = () => {
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

    // If a speech client does not exist, create one
    this.#createSpeechClient()

    // Start the streaming recognition
    // console.log(typeof speechClient.streamingRecognize)
    this.recognizeStream = this.speechClient.streamingRecognize(request)
  }

  closeSTTConnection = () => {
    if (this.#restartTimeoutId) clearTimeout(this.#restartTimeoutId)
    // Close the connection with the speech API
    this.closeRecognizeStream()
    // Close the speech client
    this.closeSpeechClient()
    // Delete the user config audio file
    this.deleteUserConfigAudio()
  }

  // Helper function for closing the connection with the speech API
  closeRecognizeStream = () => {
    if (this.recognizeStream) {
      this.recognizeStream.end()
      this.recognizeStream.removeAllListeners()
      this.recognizeStream = null
      console.log('RecognizeStream closed.')
    }
  }

  // Helper function for closing the speech client
  closeSpeechClient = () => {
    if (this.speechClient) {
      this.speechClient.close()
      // speechClient.end()
      this.speechClient = null
      console.log('SpeechClient closed.')
    }
  }

  deleteUserConfigAudio = () => {
    // Delete the user config audio file
    if (fs.existsSync(this.userConfigAudioFile)) {
      deleteFile(this.userConfigAudioFile)
    }
  }

  // Helper function for restarting the stream every streamingLimit milliseconds
  restartRecognizeStream = () => {
    //console.log('Restarting recognize stream.')
    this.closeRecognizeStream()

    //console.log('audioInput.length: ', audioInput.length)
    this.#lastAudioInput = []
    this.#lastAudioInput = this.#audioInput
    this.#audioInput = []

    this.restartCounter++

    this.#newStream = true
  }

  // Helper function for creating a transcript from the words array returned by the speech API
  createTranscript = (words) => {
    let transcript = ''
    let currentSpeaker = 1
    let currentWord = ''
    // Loop through the words array and create a transcript with speaker tags
    // Start at nextWordIndex because we don't want to include the words from previous messages
    if (typeof words[this.#nextWordIndex] !== 'undefined') {
      for (let i = this.#nextWordIndex; i < words.length; i++) {
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
        this.#nextWordIndex = i + 1
      }
      if (currentWord.length > 0) {
        transcript = transcript + 'Speaker ' + currentSpeaker + ': ' + currentWord + '\n'
      }
      return transcript
    }
  }
}

export default GCloudSTTService
