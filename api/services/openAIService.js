import {
  trimByBrackets,
  trimByDoubleQuotes,
  trimBySingleQuotes,
  trimByNumberedList,
  splitByDoubleQuotesAndCommas,
  splitByNewlines,
  splitByNumberedList,
  splitBySingleQuotesAndCommas,
} from '../utils.js'
import fs from 'fs'
import { encode, decode, isWithinTokenLimit } from 'gpt-tokenizer/model/text-davinci-003'
import { Configuration, OpenAIApi } from 'openai'

/**
 * OpenAI service class.
 * @class
 * @classdesc OpenAI service class.
 * @memberof module:api/services
 */
class OpenAIService {
  // OpenAI API configuration
  openai = null

  // Hard token limit for OpenAI API under text-davinci-003 model
  openaiHardTokenLimit = 4000

  // Soft token limit for OpenAI API under text-davinci-003 model
  openaiSoftTokenLimit = 3000

  // String that will store the context of the conversation.
  // For now, it is hardcoded to a conversation between two people. This filler text will be replaced with the actual conversation after the initial message is sent.
  #completionsContext = ''

  constructor() {
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    })

    this.openai = new OpenAIApi(configuration)
  }

  getCompletions = async (transcript) => {
    let response = []

    try {
      // If there is no context yet, then grab the example context from completionsContext.json
      if (this.#completionsContext === '') {
        const completionsContextJSON = fs.readFileSync('completionsContext.json', 'utf8')
        try {
          this.#completionsContext = JSON.parse(completionsContextJSON).text
        } catch (error) {
          console.error('Error parsing completionsContextJSON:', error)
          throw new Error('Error parsing completionsContextJSON')
        }
      }

      // Create the prompt
      let prompt =
        this.#completionsContext +
        transcript +
        '[Continue the conversation as SPEAKER 1 and write a list of the 3 most important and salient questions SPEAKER 1 would ask next and return them in an array]'

      //check if prompt exceeds out max soft token limit
      if (!isWithinTokenLimit(prompt, this.openaiSoftTokenLimit)) {
        console.log('Prompt exceeds soft token limit, trimming prompt')
        prompt = this.#trimPrompt(prompt, this.openaiSoftTokenLimit)
        console.log('Trimmed prompt:', prompt)
      }

      const responseObj = await this.openai.createCompletion({
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
      this.completionsContext += transcript
      // Parse the completions string into an array and trim out any non-standard characters
      try {
        response = this.#parseCompletions(completionsStr)
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

  // Main function to parse completions
  #parseCompletions = (completionsStr) => {
    let trimmedCompletionsString
    let response
    try {
      trimmedCompletionsString = this.#trimCompletionsString(completionsStr)
      response = this.#splitCompletionString(trimmedCompletionsString)
    } catch (err) {
      throw new Error(err.message)
    }
    return response
  }

  // Helper function to trim the completions string
  #trimCompletionsString = (completionsStr) => {
    let completions

    // If completionsStr is empty, then throw an error
    if (completionsStr === '') {
      throw new Error('Error trimming completions string: Completions string is empty')
    }

    // If completionsStr is not empty, then try trimByBrackets
    const trimByBracketsRes = trimByBrackets(completionsStr)
    // If trimByBrackets is not empty, then use it
    if (trimByBracketsRes !== '') {
      completions = trimByBracketsRes
      return completions
    }
    // If trimByBrackets is empty, then try trimByDoubleQuotes
    const trimByDoubleQuotesRes = trimByDoubleQuotes(completionsStr)
    // If trimByDoubleQuotes is not empty, then use it
    if (trimByDoubleQuotesRes !== '') {
      completions = trimByDoubleQuotesRes
      return completions
    }
    // If trimByDoubleQuotes is empty, then try trimBySingleQuotes
    const trimBySingleQuotesRes = trimBySingleQuotes(completionsStr)
    // If trimBySingleQuotes is not empty, then use it
    if (trimBySingleQuotesRes !== '') {
      completions = trimBySingleQuotesRes
      return completions
    }
    // If trimBySingleQuotes is empty, then try trimByNumberedList
    const trimByNumberedListRes = trimByNumberedList(completionsStr)
    // If trimByNumberedList is not empty, then use it
    if (trimByNumberedListRes !== '') {
      completions = trimByNumberedListRes
      return completions
    } else {
      throw new Error('Error trimming completions string: No valid trim method found: ' + completionsStr)
    }
  }

  #splitCompletionString = (completionsStr) => {
    let response = splitByDoubleQuotesAndCommas(completionsStr)
    if (response.length === 3) {
      return response
    }

    response = splitBySingleQuotesAndCommas(completionsStr)
    if (response.length === 3) {
      return response
    }

    response = splitByNewlines(completionsStr)
    if (response.length === 3) {
      return response
    }

    response = splitByNumberedList(completionsStr)
    if (response.length === 3) {
      return response
    } else {
      throw new Error('Error parsing completions string: No valid formats found. Completions: ' + completionsStr)
    }
  }

  // Helper function to trim the completions prompt
  #trimPrompt = (prompt, tokenLimit) => {
    // If its not, then we need to trim the prompt
    // First, tokenize the prompt
    const promptTokens = encode(prompt)
    // Then, trim the prompt tokens off of the front of the prompt tokens array
    const promptTokensToRemove = promptTokens.slice(0, promptTokens.length - tokenLimit)
    const promptTokensToKeep = promptTokens.slice(promptTokens.length - tokenLimit)
    // Then, decode the trimmed prompt tokens to keep
    const trimmedPrompt = decode(promptTokensToKeep)
    // Lastly, trim the prompt forward to the next start of a sentence by finding the next punctuation mark and trimming off everything before it.
    const trimmedPromptIndex = trimmedPrompt.search(/[.?!]/)
    let trimmedPromptFinal = trimmedPrompt.slice(trimmedPromptIndex + 1).trim()
    // if the trimmed prompt doesnt start with a speaker label, decode the promptTokensToRemove and search it in reverse to find the last speaker label used and prepend it to the trimmedPromptFinal
    if (!trimmedPromptFinal.startsWith('Speaker')) {
      let speakerLabelToPrepend = 'Speaker 1:' // Default to speaker 1
      const promptTokensToRemoveDecoded = decode(promptTokensToRemove)
      const speakerLabelMatches = promptTokensToRemoveDecoded.match(/Speaker \d:/g)
      if (speakerLabelMatches && speakerLabelMatches.length > 0) {
        const lastSpeakerLabelToFind = speakerLabelMatches[speakerLabelMatches.length - 1]
        const lastSpeakerLabelIndex = promptTokensToRemoveDecoded.lastIndexOf(lastSpeakerLabelToFind)
        // If the last speaker label index is found, then cut it out of the promptTokensToRemoveDecoded
        speakerLabelToPrepend = promptTokensToRemoveDecoded
          .slice(lastSpeakerLabelIndex, lastSpeakerLabelIndex + 10)
          .trim()
      }
      // If the last speaker label index is not found, then search forward in the trimmedPromptFinal for the first speaker label and use it to assume the last speaker label
      else {
        const firstSpeakerLabel = trimmedPromptFinal.match(/Speaker \d:/)[0]
        if (firstSpeakerLabel) {
          // If the speaker label is for speaker 1, assume that speaker 2 was the last speaker
          if (firstSpeakerLabel.includes('1')) {
            speakerLabelToPrepend = 'Speaker 2:'
          }
        }
        // Otherwise, just use the default speaker label of Speaker 1
      }
      trimmedPromptFinal = speakerLabelToPrepend + ' ' + trimmedPromptFinal
    }
    return trimmedPromptFinal
  }
}

export default OpenAIService
