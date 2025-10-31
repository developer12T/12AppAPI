const { getModelsByChannel } = require('../../middleware/channel')
const campaignModel = require('../../models/cash/campaign')
// const { generateCampaignId } = require('../../utilities/genetateId')
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // โฟลเดอร์ temp สำหรับเก็บไฟล์
const cpUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

async function saveFiles(req, folderName = '') {
  const results = {};
  const imageFile = req.files['image'] ? req.files['image'][0] : null;
  const fileFile = req.files['file'] ? req.files['file'][0] : null;

  const uploadDir = path.join(__dirname, '../../public/campaign');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // อ่านรายชื่อไฟล์ที่มีใน uploadDir เพื่อเช็คเลขลำดับล่าสุด
  const existingFiles = fs.readdirSync(uploadDir);

  // ฟังก์ชันช่วยหาเลขลำดับสูงสุดที่มีในชื่อไฟล์
  const getMaxIndex = () => {
    let max = 0;
    const regex = folderName
      ? new RegExp(`^${folderName}-.*-(\\d{3})\\.`)
      : /-(\d{3})\./;

    existingFiles.forEach(filename => {
      const match = filename.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    });
    return max;
  };

  let index = getMaxIndex(); // เริ่มจากเลขลำดับล่าสุด

  async function moveFile(file) {
    index++; // เพิ่มลำดับทีละ 1
    const ext = path.extname(file.originalname); // .jpg, .png
    const baseName = path.basename(file.originalname, ext);

    const newFileName = folderName
      ? `${folderName}-${baseName}-${String(index).padStart(3, '0')}${ext}`
      : `${baseName}-${String(index).padStart(3, '0')}${ext}`;

    const destPath = path.join(uploadDir, newFileName);
    return new Promise((resolve, reject) => {
      fs.rename(file.path, destPath, err => {
        if (err) reject(err);
        else resolve(destPath);
      });
    })
  }

  if (imageFile) results.imagePath = await moveFile(imageFile);
  if (fileFile) results.filePath = await moveFile(fileFile);

  return results;
}

// ตัวอย่างฟังก์ชัน generateCampaignId (เรียกใช้จริงต้องเขียนเองตาม DB ของคุณ)
async function generateCampaignId(CampaignModel) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;

  const regex = new RegExp(`^CAM-${dateStr}-(\\d{3})$`);
  const latest = await CampaignModel.findOne({ id: { $regex: regex } }).sort({ id: -1 }).lean();

  let nextNumber = 1;
  if (latest) {
    const match = latest.id.match(/(\d{3})$/);
    if (match) nextNumber = parseInt(match[1], 10) + 1;
  }

  const nextNumberStr = String(nextNumber).padStart(3, '0');
  return `CAM-${dateStr}-${nextNumberStr}`;
}

exports.addCampaign = [
  cpUpload,
  async (req, res) => {
    try {
      const addCampaignDetailStr = req.body.addCampaigDetail;
      if (!addCampaignDetailStr) {
        return res.status(400).json({ status: 400, message: 'addCampaigDetail is required' });
      }

      let addCampaignDetail;
      try {
        addCampaignDetail = JSON.parse(addCampaignDetailStr);
      } catch {
        return res.status(400).json({ status: 400, message: 'Invalid JSON in addCampaigDetail' });
      }

      const channel = req.headers['x-channel'];
      const { Campaign } = getModelsByChannel(channel, res, campaignModel);

      const latestCampaign = await Campaign.aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
        { $project: { id: 1, _id: 0 } }
      ]);

      let newCampaignId;
      if (latestCampaign.length === 0) {
        newCampaignId = await generateCampaignId(Campaign);
      } else {
        // ถ้ามีแล้ว เอา id ล่าสุดมาแปลงเลขลำดับต่อไปก็ได้
        newCampaignId = await generateCampaignId(Campaign);
      }

      const savedPaths = await saveFiles(req, newCampaignId);
      nameImage = savedPaths.imagePath.match(/CAM[-\w\d]*\.[\w\d]+/)?.[0] || ''
      nameFile = savedPaths.filePath.match(/CAM[-\w\d]*\.[\w\d]+/)?.[0] || ''

      const newCampaign = new Campaign({
        id: newCampaignId,
        title: addCampaignDetail.title,
        des: addCampaignDetail.des,
        aticle: addCampaignDetail.aticle,
        link: addCampaignDetail.link,
        image: `https://apps.onetwotrading.co.th/campaign/${nameImage}`,
        file: `https://apps.onetwotrading.co.th/campaign/${nameFile}`,
        createdAt: new Date()
      });

      await newCampaign.save();

      res.status(200).json({
        status: 200,
        message: 'Campaign added successfully',
        data: newCampaign
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: 500, message: error.message });
    }
  }
];



exports.getCampaign = async (req, res) => {

  try {
    const channel = req.headers['x-channel'];
    const { Campaign } = getModelsByChannel(channel, res, campaignModel);
    const data = await Campaign.find()



    res.status(200).json({
      status: 200,
      message: 'Campaign added successfully',
      data: data
    });
  } catch (error) {
    console.error('❌ Error', error)

    res.status(500).json({
      status: 500,
      message: 'error from server',
      error: error.message || error.toString(), // ✅ ป้องกัน circular object
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // ✅ แสดง stack เฉพาะตอน dev
    })
  }



}