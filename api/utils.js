// Desc: Utility functions for the API
import fs from 'fs'

// Helper function to trim the completions string by brackets
export const trimByBrackets = (completionsStr) => {
  let response = ''
  // Find the first bracket in the string and trim off everything before it
  const start = completionsStr.indexOf('[') + 1
  // Find the last bracket in the string and trim off everything after it
  const end = completionsStr.lastIndexOf(']')
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by double quotes
export const trimByDoubleQuotes = (completionsStr) => {
  let response = ''
  // Find the first double quote in the string and trim off everything before it
  const start = completionsStr.indexOf('"') + 1
  // Find the last double quote in the string and trim off everything after it
  const end = completionsStr.lastIndexOf('"')
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by single quotes
export const trimBySingleQuotes = (completionsStr) => {
  let response = ''
  // Find the first single quote in the string that direct precedes a capital letter and trim off everything before it
  const start = completionsStr.search(/'(?=[A-Z])/) + 1
  // Find the last single quote in the string that direct follows a period, question mark, or exclamation, and trim off everything after it
  const end = completionsStr.search(/(?<=[.?!])'/)
  response = completionsStr.substring(start, end)
  return response
}

// Helper function to trim the completions string by numbered list
export const trimByNumberedList = (completionsStr) => {
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

// Helper function for splitting completions by double quotes and commas
export const splitByDoubleQuotesAndCommas = (completions) => {
  return completions.split('",').map((item) => item.replace(/"/g, ''))
}

// Helper function for splitting completions by single quotes and commas
export const splitBySingleQuotesAndCommas = (completions) => {
  return completions.split("',").map((item) => item.replace(/'(?=[A-Z])/g, ''))
}

// Helper function for splitting completions by newline characters
export const splitByNewlines = (completions) => {
  return completions.split('\n').filter((item) => item !== '')
}

// Helper function for splitting completions by numbered list
export const splitByNumberedList = (completions) => {
  const splitRes = completions.split(/\d+\.\s/)
  // Remove the first item since we don't care what comes before the first number
  splitRes.slice(1)
  return splitRes
}

// Helper function to write buffer to file
export const writeBufferToFile = (fileName, buffer) => {
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
export const deleteFile = (fileName) => {
  fs.unlink(fileName, (err) => {
    if (err) {
      console.error(err)
      return
    }
    //file removed successfully
  })
}
