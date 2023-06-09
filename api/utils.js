// Desc: Utility functions for the API

// Helper function to trim the completions string by brackets
const trimByBrackets = (completionsStr) => {
  let response = ''
  // Find the first bracket in the string and trim off everything before it
  const start = completionsStr.indexOf('[') + 1
  // Find the last bracket in the string and trim off everything after it
  const end = completionsStr.lastIndexOf(']')
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by double quotes
const trimByDoubleQuotes = (completionsStr) => {
  let response = ''
  // Find the first double quote in the string and trim off everything before it
  const start = completionsStr.indexOf('"') + 1
  // Find the last double quote in the string and trim off everything after it
  const end = completionsStr.lastIndexOf('"')
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by single quotes
const trimBySingleQuotes = (completionsStr) => {
  let response = ''
  // Find the first single quote in the string that direct precedes a capital letter and trim off everything before it
  const start = completionsStr.search(/'(?=[A-Z])/) + 1
  // Find the last single quote in the string that direct follows a period, question mark, or exclamation, and trim off everything after it
  const end = completionsStr.search(/(?<=[.?!])'/)
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by numbered list
const trimByNumberedList = (completionsStr) => {
  console.log('trimByNumberedList completionsStr: ' + completionsStr)
  let response = ''
  const regex = /\d+\.\s/g
  const numberBulletMatches = completionsStr.match(regex)
  if (numberBulletMatches && numberBulletMatches.length > 0) {
    // Find the first number in the string followed by a period and trim off everything before it
    const start = completionsStr.indexOf(numberBulletMatches[0])
    let end = null
    console.log('start: ' + start)
    // Find the index of the last occurrence of a number followed by a period
    const lastNumberIndex = completionsStr.lastIndexOf(numberBulletMatches[numberBulletMatches.length - 1])
    console.log('lastNumberIndex: ' + lastNumberIndex)
    if (lastNumberIndex !== -1) {
      // Find the index of the next punctuation mark (., ?, or !) after the last number accounting for positions of the last number and the following period
      const afterLastNumberStr = completionsStr.substring(lastNumberIndex + 2)
      console.log('afterLastNumber: ' + afterLastNumberStr)
      const lastPunctuationIndex = afterLastNumberStr.search(/[.?!]/)
      console.log('lastPunctuationIndex: ' + lastPunctuationIndex)
      if (lastPunctuationIndex !== -1) {
        // If there is a punctuation mark after the last number, then set end to the index of that punctuation mark plus the index of the last number plus the index of the following period
        end = lastNumberIndex + lastPunctuationIndex + 3
      }
      console.log('end: ' + end)
    }
    response = completionsStr.substring(start, end)
  }
  return response.trim()
}

// Helper function to trim the completions string
const trimCompletionsString = (completionsStr) => {
  console.log('trimCompletionsString completionsStr: ' + completionsStr)
  let completions

  // If completionsStr is empty, then throw an error
  if (completionsStr === '') {
    throw new Error('Error trimming completions string: Completions string is empty')
  }

  console.log('Trying trim by brackets')
  // If completionsStr is not empty, then try trimByBrackets
  const trimByBracketsRes = trimByBrackets(completionsStr)
  console.log('trimByBracketsRes: ' + trimByBracketsRes)
  console.log('completionStr trimByBrackets: ' + completionsStr)
  // If trimByBrackets is not empty, then use it
  if (trimByBracketsRes !== '') {
    completions = trimByBracketsRes
    return completions
  }
  console.log('Trying trim by double quotes')
  // If trimByBrackets is empty, then try trimByDoubleQuotes
  const trimByDoubleQuotesRes = trimByDoubleQuotes(completionsStr)
  console.log('trimByDoubleQuotesRes: ' + trimByDoubleQuotesRes)
  // If trimByDoubleQuotes is not empty, then use it
  if (trimByDoubleQuotesRes !== '') {
    completions = trimByDoubleQuotesRes
    return completions
  }
  console.log('Trying trim by single quotes')
  // If trimByDoubleQuotes is empty, then try trimBySingleQuotes
  const trimBySingleQuotesRes = trimBySingleQuotes(completionsStr)
  console.log('trimBySingleQuotesRes: ' + trimBySingleQuotesRes)
  // If trimBySingleQuotes is not empty, then use it
  if (trimBySingleQuotesRes !== '') {
    completions = trimBySingleQuotesRes
    return completions
  }
  console.log('Trying trim by numbered list: ' + completionsStr)
  // If trimBySingleQuotes is empty, then try trimByNumberedList
  const trimByNumberedListRes = trimByNumberedList(completionsStr)
  console.log('trimByNumberedListRes: ' + trimByNumberedListRes)
  // If trimByNumberedList is not empty, then use it
  if (trimByNumberedListRes !== '') {
    completions = trimByNumberedListRes
    return completions
  } else {
    throw new Error('Error trimming completions string: No valid trim method found: ' + completionsStr)
  }
}

// Helper function for splitting completions by double quotes and commas
const splitByDoubleQuotesAndCommas = (completions) => {
  return completions.split('",').map((item) => item.replace(/"/g, ''))
}

// Helper function for splitting completions by single quotes and commas
const splitBySingleQuotesAndCommas = (completions) => {
  return completions.split("',").map((item) => item.replace(/'(?=[A-Z])/g, ''))
}

// Helper function for splitting completions by newline characters
const splitByNewlines = (completions) => {
  return completions.split('\n').filter((item) => item !== '')
}

// Helper function for splitting completions by numbered list
const splitByNumberedList = (completions) => {
  const splitRes = completions.split(/\d+\.\s/)
  // Remove the first item since we don't care what comes before the first number
  splitRes.slice(1)
  return splitRes
}

// Main function to parse completions
export const parseCompletions = (completionsStr) => {
  console.log('parseCompletions completionsStr: ' + completionsStr)
  let trimmedCompletionsString
  try {
    trimmedCompletionsString = trimCompletionsString(completionsStr)
  } catch (err) {
    throw new Error(err.message)
  }

  let response = splitByDoubleQuotesAndCommas(trimmedCompletionsString)
  if (response.length === 3) {
    return response
  }

  response = splitBySingleQuotesAndCommas(trimmedCompletionsString)
  if (response.length === 3) {
    return response
  }

  response = splitByNewlines(trimmedCompletionsString)
  if (response.length === 3) {
    return response
  }

  response = splitByNumberedList(trimmedCompletionsString)
  if (response.length === 3) {
    return response
  } else {
    throw new Error(
      'Error parsing completions string: No valid formats found. Completions: ' + trimmedCompletionsString
    )
  }
}
