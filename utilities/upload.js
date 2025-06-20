const fs = require('fs')
const path = require('path')
const multer = require('multer')
// const storage = multer.memoryStorage()
// const upload = multer({ storage: storage }).array('storeImages', 10)
const { timestamp } = require('./datetime')

const uploadFiles = async (files, basePath, subFolder = '', name = '') => {
  const uploadedFiles = await Promise.all(
    files.map(async file => {
      const imageName = `${Date.now()}-${timestamp()}-${name}${path.extname(
        file.originalname
      )}`

      const targetDir = path.join(basePath, subFolder)
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true })
      }

      const filePath = path.join(targetDir, imageName)
      const publicPath = path.join('/', subFolder, imageName)

      await fs.promises.writeFile(filePath, file.buffer)

      return {
        name: imageName,
        path: process.env.CA_IMG_URI + publicPath,
        fullPath: filePath
      }
    })
  )

  return uploadedFiles
}

const uploadFilesCheckin = async (
  files,
  basePath,
  subFolder = '',
  name = ''
) => {
  const uploadedFiles = await Promise.all(
    files.map(async file => {
      const imageName = `${Date.now()}-${timestamp()}-${name}${path.extname(
        file.originalname
      )}`

      const targetDir = path.join(basePath, subFolder)
      if (!fs.existsSync(targetDir)) {
        await fs.promises.mkdir(targetDir, { recursive: true })
      }

      const filePath = path.join(targetDir, imageName)

      // ✅ แก้ตรงนี้: ให้ publicPath มี 'stores/checkin' เสมอ
      const publicPath = path.join(
        '/stores/checkin',
        subFolder,
        imageName
      )

      await fs.promises.writeFile(filePath, file.buffer)

      return {
        name: imageName,
        path:
          process.env.CA_IMG_URI +
          publicPath.replace(/\\\\/g, '/').replace(/\\/g, '/'), // normalize path
        fullPath: filePath
      }
    })
  )

  return uploadedFiles
}

module.exports = { uploadFiles, uploadFilesCheckin }

// const uploadFiles = async (files, basePath, subFolder = '', name = '') => {
//     if (!files || !Array.isArray(files) || files.length === 0) {
//         console.error('No files provided for upload.')
//         return []
//     }

//     const uploadedFiles = await Promise.all(
//         files.map(async (file) => {
//             const imageName = ${ Date.now()
//         }-${ name }${ path.extname(file.originalname) }

//             const targetDir = path.join(basePath, subFolder)
//     if (!fs.existsSync(targetDir)) {
//         await fs.promises.mkdir(targetDir, { recursive: true })
//     }

//     const filePath = path.join(targetDir, imageName)
//     const publicPath = path.join('/', subFolder, imageName)

//     await fs.promises.writeFile(filePath, file.buffer)

//     return {
//         name: imageName,
//         path: process.env.CA_IMG_URI + publicPath,
//         fullPath: filePath,
//     }
// })
//     )

// return uploadedFiles
// }

// module.exports = { uploadFiles }
