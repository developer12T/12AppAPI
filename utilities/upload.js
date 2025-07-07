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



async function moveFile(file, destFolder) {
  const destPath = path.join(destFolder, file.originalname);
  
  return new Promise((resolve, reject) => {
    fs.rename(file.path, destPath, (err) => {
      if (err) return reject(err);
      resolve(destPath);
    });
  });
}

const saveFiles = async (req) => {
  const campaignFolder = path.join(__dirname, '../../public/campaign');

  if (!fs.existsSync(campaignFolder)) {
    fs.mkdirSync(campaignFolder, { recursive: true });
  }

  const results = {};

  const imageFile = req.files['image'] ? req.files['image'][0] : null;
  const fileFile = req.files['file'] ? req.files['file'][0] : null;

  if (imageFile) {
    results.imagePath = await moveFile(imageFile, campaignFolder);
  }
  if (fileFile) {
    results.filePath = await moveFile(fileFile, campaignFolder);
  }

  return results;
};





module.exports = { uploadFiles, uploadFilesCheckin,saveFiles }

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
