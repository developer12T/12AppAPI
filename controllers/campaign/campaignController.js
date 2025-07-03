const { getModelsByChannel } = require('../../middleware/channel')
const campaignModel = require('../../models/cash/campaign')
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const cpUpload = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

exports.addCampaign = [
  cpUpload,  // multer middleware
  async (req, res) => {
    try {
      const addCampaignDetail = req.body.addCampaigDetail; // รับข้อความได้แน่นอน
      const channel = req.headers['x-channel'];
      const { Campaign } = getModelsByChannel(channel, res, campaignModel);

      console.log('addCampaignDetail:', addCampaignDetail);
      console.log('files:', req.files);

      // ทำงานกับข้อมูลของคุณที่นี่...

      res.status(200).json({
        status: 200,
        message: 'Success',
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: '500', message: error.message });
    }
  }
];
