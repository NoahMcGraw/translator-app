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
import { encode, decode } from 'gpt-tokenizer/model/text-davinci-003'
// Main function to parse completions
export const parseCompletions = (completionsStr) => {
  let trimmedCompletionsString
  let response
  try {
    trimmedCompletionsString = trimCompletionsString(completionsStr)
    response = splitCompletionString(trimmedCompletionsString)
  } catch (err) {
    throw new Error(err.message)
  }
  return response
}

// Helper function to trim the completions string
const trimCompletionsString = (completionsStr) => {
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

const splitCompletionString = (completionsStr) => {
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
export const trimPrompt = (prompt, tokenLimit) => {
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
