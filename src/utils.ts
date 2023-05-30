export async function waitForVariable<T>(variable: T, maxTimeOut: number = 10): Promise<T> {
  let curTimeOut = 0
  return new Promise<T>((resolve, reject) => {
    const intervalId = setInterval(() => {
      if (variable !== undefined) {
        clearInterval(intervalId)
        resolve(variable)
      } else if (curTimeOut < maxTimeOut) {
        curTimeOut++
      } else {
        reject('Timed out waiting for variable')
      }
    }, 100) // Adjust the interval duration as needed
  })
}
