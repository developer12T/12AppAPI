// const { User } = require('../../models/cash/user')
const { period, previousPeriod } = require('../../utilities/datetime')
const sql = require('mssql');
const fs = require('fs');
const dayjs = require('dayjs');
const XLSX = require('xlsx');
const { uploadFiles } = require('../../utilities/upload')
const multer = require('multer')
const path = require('path')
const upload = multer({ storage: multer.memoryStorage() }).single('image')
const bcrypt = require('bcrypt')
const axios = require('axios')
const userModel = require('../../models/cash/user')
const { getModelsByChannel } = require('../../middleware/channel')
const { userQuery, userQueryFilter, userQueryManeger, userQueryOne } = require('../../controllers/queryFromM3/querySctipt');
const user = require('../../models/cash/user');
const { getSocket } = require('../../socket')
const { encrypt, decrypt } = require('../../middleware/authen')


function exportUsersToXlsx(data, sheetName = 'Sheet1') {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // สร้าง buffer จาก workbook แทนการเขียนไฟล์
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

exports.getUser = async (req, res) => {
  try {
    const channel = req.headers['x-channel'];
    const { User } = getModelsByChannel(channel, res, userModel);

    const users = await User.find({})
      .select('-_id saleCode salePayer username firstName password surName tel zone area warehouse role qrCodeImage updatedAt')
      .lean();

    const usersWithTHTime = users.map(item => {
      let decryptedPassword = '';
      try {
        decryptedPassword = decrypt(item.password);
      } catch (err) {
        decryptedPassword = '[decrypt error]';
      }

      return {
        ...item,
        password: decryptedPassword,
        updatedAt: new Date(new Date(item.updatedAt).getTime() + 7 * 60 * 60 * 1000)
      };
    });

    if (!users || users.length === 0) {
      return res.status(404).json({ status: 404, message: 'User is empty!' });
    }

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: usersWithTHTime
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message });
  }
};

exports.downloadUserExcel = async (req, res) => {
  try {
    const { User } = getModelsByChannel('cash', res, userModel);
    const users = await User.find({ role: 'sale' }).lean();

    if (!users || users.length === 0) {
      return res.status(404).json({ status: 404, message: 'User not found' });
    }

    const formattedUsers = users.map(user => {
      let password = '';
      try {
        password = decrypt(user.password);
      } catch {
        password = '[decrypt error]';
      }

      return {
        saleCode: user.saleCode,
        username: user.username,
        firstName: user.firstName,
        surName: user.surName,
        password: password,
        tel: user.tel,
        zone: user.zone,
        area: user.area,
        warehouse: user.warehouse,
        role: user.role,
        updatedAt: new Date(new Date(user.updatedAt).getTime() + 7 * 60 * 60 * 1000).toISOString()
      };
    });

    const buffer = exportUsersToXlsx(formattedUsers, 'Users');

    res.setHeader('Content-Disposition', 'attachment; filename="user-export.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 500, message: err.message });
  }
};






exports.editUser = async (req, res) => {
  try {
    const { userId, username, ...updateData } = req.body
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    if (!userId && !username) {
      return res.status(400).json({
        status: 400,
        message: 'userId or username is required!'
      })
    }

    let query = userId ? { _id: userId } : { username }

    const user = await User.findOneAndUpdate(query, updateData, {
      new: true,
      select: '-_id -__v'
    }).lean()

    if (!user) {
      return res.status(404).json({
        status: 404,
        message: 'User not found!'
      })
    }

    res.status(200).json({
      status: 200,
      message: 'User updated successfully!',
      data: user
    })
  } catch (error) {
    console.error('Error updating user:', error)
    res.status(500).json({ status: 500, message: error.message })
  }
}

exports.addImage = async (req, res) => {
  try {
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    upload(req, res, async err => {
      if (err) {
        return res.status(400).json({
          status: 400,
          message: 'Error uploading file',
          error: err.message
        })
      }

      const { userId, type } = req.body
      if (!userId || !type) {
        return res
          .status(400)
          .json({ status: 400, message: 'userId and type required!' })
      }

      const user = await User.findOne({ _id: userId })
      if (!user) {
        return res.status(404).json({ status: 404, message: 'User not found!' })
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ status: 400, message: 'No images uploaded!' })
      }

      const basePath = path.join(__dirname, '../../public/images')
      const uploadedImage = await uploadFiles(
        [req.file],
        basePath,
        type,
        user.area
      )

      user.image = [
        {
          name: uploadedImage[0].name,
          path: uploadedImage[0].path,
          type: type
        }
      ]

      await user.save()

      res.status(200).json({
        status: 200,
        message: 'Images uploaded successfully!',
        data: user.image
      })
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.getQRcode = async (req, res) => {
  try {
    const { area } = req.query
    const channel = req.headers['x-channel']
    const { User } = getModelsByChannel(channel, res, userModel)
    if (!area) {
      return res
        .status(400)
        .json({ status: 400, message: 'area are required!' })
    }

    const qrcode = await User.findOne({ area }).select('-_id qrCodeImage')

    // if (type) {
    //   qrcode.image = qrcode.image.filter(img => img.type === type)
    // }

    res.status(200).json({
      status: 200,
      message: 'successful!',
      data: qrcode.qrCodeImage
    })
  } catch (error) {
    console.error('Error uploading images:', error)
    res
      .status(500)
      .json({ status: 500, message: 'Server error', error: error.message })
  }
}

exports.addUser = async (req, res) => {
  try {
    let pathPhp = ''
    const channel = req.headers['x-channel']
    switch (channel) {
      case 'cash':
        pathPhp = 'ca_api/ca_user.php'
        break
      case 'credit':
        pathPhp = 'cr_api/cr_user.php'
        break
      default:
        break
    }
    const { User } = getModelsByChannel(channel, res, userModel)
    const response = await axios.post(
      `http://58.181.206.159:9814/apps_api/${pathPhp}`
    )

    for (const sale of response.data) {
      const saleInData = await User.findOne({ saleCode: sale.saleCode })
      if (!saleInData) {
        const newUser = new User({
          saleCode: sale.saleCode,
          salePayer: sale.salePayer,
          username: sale.username,
          firstName: sale.firstName,
          surName: sale.surName,
          password: sale.password,
          tel: sale.tel,
          zone: sale.zone,
          area: sale.area,
          warehouse: sale.warehouse,
          role: sale.role,
          status: sale.status,
          qrCodeImage: sale.qrCodeImage,
          period: period(),
          image: ''
        })
        await newUser.save()
      }
    }

    res.status(200).json({
      status: 200,
      message: 'Insert User Success'
    })
  } catch (error) {
    console.error(e)
    res.status(500).json({
      status: 500,
      message: e.message
    })
  }
}

exports.addUserOne = async (req, res) => {
  const { area } = req.body
  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  const tableData = await userQueryOne(channel, area);

  for (const sale of tableData) {
    const encryptedPassword = encrypt(sale.password);

    await User.create({
      saleCode: sale.saleCode,
      salePayer: sale.salePayer,
      username: sale.username,
      firstName: sale.firstName,
      surName: sale.surName,
      password: encryptedPassword,
      tel: sale.tel,
      zone: sale.zone,
      area: sale.area,
      warehouse: sale.warehouse,
      role: sale.role,
      status: sale.status,
      qrCodeImage: sale.qrCodeImage,
      image: '',
      typeTruck: sale.typeTruck,
      noTruck: sale.noTruck
    });
  }



  res.status(200).json({
    status: 200,
    message: 'Insert User Success',
    data: tableData
  })
}

exports.updateUserOne = async (req, res) => {

  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  // const user = await User.findOne({saleCode:req.body.saleCode})




  if (!req.body.username) {
    return res.status(400).json({
      status: 400,
      message: 'username is required!'
    })
  }


  const encryptedPassword = encrypt(req.body.password);
  const user = await User.updateOne(
    { username: req.body.username },
    {
      $set: {
        salePayer: req.body.salePayer,
        username: req.body.username,
        firstName: req.body.firstName,
        surName: req.body.surName,
        password: encryptedPassword,
        tel: req.body.tel,
        zone: req.body.zone,
        area: req.body.area,
        warehouse: req.body.warehouse,
        role: req.body.role,
        status: req.body.status,
        image: req.body.image
      }
    }
  )

  res.status(200).json({
    status: 200,
    message: 'Update User Success'
    // user
  })
}

exports.addAndUpdateUser = async (req, res) => {
  const channel = req.headers['x-channel']
  const { User } = getModelsByChannel(channel, res, userModel)
  const userMongo = await User.find()
  let pathPhp = ''
  switch (channel) {
    case 'cash':
      pathPhp = 'ca_api/ca_user.php'
      break
    case 'credit':
      pathPhp = 'cr_api/cr_user.php'
      break
    default:
      break
  }

  const userM3 = await axios.post(
    `http://58.181.206.159:9814/apps_api/${pathPhp}`
  )
  let update = 0
  let addNew = 0
  for (const m3 of userM3.data) {
    const userInMongo = userMongo.find(id => id.saleCode == m3.saleCode)

    if (userInMongo) {
      const hasChanged = Object.keys(m3).some(
        key =>
          !['saleCode', '__v'].includes(key) && m3[key] !== userInMongo[key]
      )

      if (hasChanged) {
        // console.log(m3)
        await User.updateOne(
          { saleCode: m3.saleCode },
          {
            $set: {
              salePayer: m3.salePayer,
              username: m3.username,
              firstName: m3.firstName,
              surName: m3.surName,
              password: m3.password,
              tel: m3.tel,
              zone: m3.zone,
              area: m3.area,
              warehouse: m3.warehouse,
              role: m3.role,
              status: m3.status
              // __v: m3.__v + 1
            }
          }
        )
        update += 1
      }
    } else {
      await User.create({
        saleCode: m3.saleCode,
        salePayer: m3.salePayer,
        username: m3.username,
        firstName: m3.firstName,
        surName: m3.surName,
        password: m3.password,
        tel: m3.tel,
        zone: m3.zone,
        area: m3.area,
        warehouse: m3.warehouse,
        role: m3.role,
        status: m3.status
        // __v: 0
      })
      addNew += 1
    }
  }
  res.status(200).json({
    status: 200,
    message: `Insert And Update Success`,
    Update: update,
    Add: addNew
  })
}

exports.addUserManeger = async (req, res) => {
  try {
    const channelHeader = req.headers['x-channel'];
    const tableData = await userQueryManeger(channelHeader);

    let update = 0;
    let addNew = 0;

    const { User } = getModelsByChannel('user', res, userModel);

    for (const m3 of tableData) {
      const encryptedPassword = encrypt('2020'); // 🔐 รหัสผ่านเริ่มต้น

      const existingUser = await User.findOne({ username: m3.username });

      if (existingUser) {
        // อัปเดตข้อมูล
        await User.updateOne(
          { username: m3.username },
          {
            $set: {
              saleCode: m3.saleCode,
              salePayer: m3.salePayer,
              firstName: m3.firstName,
              surName: m3.surName,
              password: encryptedPassword,
              tel: m3.tel,
              zone: m3.zone,
              area: m3.area,
              warehouse: m3.warehouse,
              role: m3.role,
              status: m3.status
            }
          }
        );
        update += 1;
      } else {
        // เพิ่มใหม่
        let platformType = ''
        if (m3.role == 'admin'){
          platformType = 'ADMIN'
        } else{
          platformType = 'CASH'
        }

        await User.create({
          saleCode: m3.saleCode,
          salePayer: m3.salePayer,
          username: m3.username,
          firstName: m3.firstName,
          surName: m3.surName,
          password: encryptedPassword,
          tel: m3.tel,
          zone: m3.zone,
          area: m3.area,
          warehouse: m3.warehouse,
          role: m3.role,
          status: m3.status,
          platformType: platformType
        });
        addNew += 1;
      }
    }

    res.status(200).json({
      status: 200,
      message: 'successful',
      updated: update,
      added: addNew
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: 500, message: error.message });
  }
};


exports.addUserNew = async (req, res) => {
  const channel = req.headers['x-channel'];


  const { User } = getModelsByChannel('user', res, userModel);

  const tableData = await userQuery(channel);
  const tableMap = new Map(tableData.map(item => [item.saleCode, item]));
  const mongoUsers = await User.find();
  const result = [];

  // STEP 1: เพิ่มหรืออัปเดต
  for (const sale of tableData) {
    const existingUser = await User.findOne({ saleCode: sale.saleCode });

    if (existingUser) {
      let isModified = false;
      const fields = [
        'salePayer', 'username', 'firstName', 'surName', 'password',
        'tel', 'zone', 'area', 'warehouse', 'role', 'status', 'qrCodeImage', 'typeTruck', 'noTruck'
      ];

      for (const field of fields) {
        const incomingValue = field === 'password' ? encrypt(sale.password) : sale[field];
        if (existingUser[field] !== incomingValue) {
          existingUser[field] = incomingValue;
          isModified = true;
        }
      }

      if (isModified) {
        existingUser.period = period();
        await existingUser.save();
        result.push(existingUser);
      }
    } else {
      const encryptedPassword = encrypt(sale.password);

      const newUser = new User({
        saleCode: sale.saleCode,
        salePayer: sale.salePayer,
        username: sale.username,
        firstName: sale.firstName,
        surName: sale.surName,
        password: encryptedPassword,
        tel: sale.tel,
        zone: sale.zone,
        area: sale.area,
        warehouse: sale.warehouse,
        role: sale.role,
        status: sale.status,
        qrCodeImage: sale.qrCodeImage,
        period: period(),
        image: '',
        typeTruck: sale.typeTruck,
        noTruck: sale.noTruck,
        platformType: 'CASH'
      });
      await newUser.save();
      result.push(newUser);
    }
  }

  res.status(200).json({
    status: 200,
    message: 'Sync User Success',
    data: result
  });
};

exports.addUserArray = async (req, res) => {
  const { area } = req.body
  const channel = req.headers['x-channel']
  const data = await userQueryFilter(channel, area)
  const { User } = getModelsByChannel(channel, res, userModel)
  let areaInDb = [];
  let areaInserted = [];

  for (const item of data) {
    const mongoUser = await User.findOne({ area: item.area });

    if (!mongoUser) {
      await new User(item).save();
      areaInserted.push(item.area);
    } else {
      areaInDb.push(item.area);
    }
  }

  if (data.length === 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found area'
    });
  }

  res.status(200).json({
    status: 200,
    message: 'Process complete',
    insertedAreas: areaInserted,
    alreadyExists: areaInDb
  })
}



exports.updateUserArray = async (req, res) => {

  const { area } = req.body
  const channel = req.headers['x-channel']
  const data = await userQueryFilter(channel, area)

  const { User } = getModelsByChannel(channel, res, userModel)
  for (const item of data) {
    const mongoUser = await User.findOne({ area: item.area });
    if (mongoUser) {
      userNew = await User.updateOne(
        { area: item.area },
        {
          $set: {
            salePayer: item.salePayer,
            username: item.username,
            firstName: item.firstName,
            surName: item.surName,
            password: item.password,
            tel: item.tel,
            zone: item.zone,
            area: item.area,
            warehouse: item.warehouse,
            role: item.role,
            status: item.status,
            image: item.image
          }
        }
      )
    }
  }

  if (data.length == 0) {
    return res.status(404).json({
      status: 404,
      message: 'Not found area'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'Update User Success',
    area: data
  })
}


exports.deleteUserArray = async (req, res) => {
  const { area } = req.body; // array: ['BE212', 'BE213']
  const channel = req.headers['x-channel'];
  const { User } = getModelsByChannel(channel, res, userModel);

  const usersToDelete = await User.find({ area: { $in: area } });
  const deletedAreas = usersToDelete.map(user => user.area);

  await User.deleteMany({ area: { $in: area } });

  res.status(200).json({
    status: 200,
    message: 'Deleted successfully',
    deletedAreas: deletedAreas
  });
}


exports.getAreaAll = async (req, res) => {
  const channel = req.headers['x-channel'];
  const { User } = getModelsByChannel(channel, res, userModel);

  const data = await User.aggregate([
    {
      $match: {
        area: { $ne: '' }
      }
    },
    {
      $group: {
        _id: '$area'
      }
    },
    {
      $project: {
        _id: 0,
        area: '$_id'
      }
    },
    { $sort: { area: 1 } }
  ])

  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: data
  });

}


exports.checkUserLogin = async (req, res) => {
  const channel = req.headers['x-channel'];
  const { User } = getModelsByChannel(channel, res, userModel);

  const dataUser = await User.aggregate([
    {
      $match: { role: 'sale' }
    },
    {
      $addFields: {
        fullName: {
          $concat: [
            { $ifNull: ["$firstName", ""] },
            " ",
            { $ifNull: ["$surName", ""] }
          ]
        }
      }
    },
    {
      $project: {
        _id: 0,
        zone: 1,
        area: 1,
        saleCode: 1,
        salePayer: 1,
        fullName: 1,
        updatedAt: 1,
      }
    }
  ]);




  const exportData = dataUser.map(user => ({
    zone: user.zone,
    area: user.area,
    saleCode: user.saleCode,
    salePayer: user.salePayer,
    fullName: user.fullName,
    updatedAt: dayjs(user.updatedAt).format('YYYY-MM-DD HH:mm:ss')
  }));

  // Export to Excel
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
  XLSX.writeFile(workbook, "dataUser.xlsx");

  console.log("✅ สร้างไฟล์ Excel: dataUser.xlsx ด้วยวันที่ฟอร์แมตเรียบร้อยแล้ว");


  res.status(200).json({
    status: 200,
    message: 'successfully',
    data: dataUser
  });
};

exports.getTeam = async (req, res) => {

  const { zone } = req.query
  const channel = req.headers['x-channel'];
  const { User } = getModelsByChannel(channel, res, userModel);

  const dataUser = await User.aggregate([
    { $match: { zone: zone } },
    {
      $group: {
        _id: {
          $concat: [
            { $substr: ['$area', 0, 2] },    // 2 ตัวแรก
            { $substr: ['$area', 3, 1] }     // ตัวที่ 4 (index เริ่ม 0)
          ]
        }
      }
    },
    { $match: { _id: { $ne: '' } } },
    {
      $project: {
        _id: 0,
        saleTeam: '$_id'
      }
    }
  ]);


  if (dataUser.length == 0) {

    return res.status(404).json({
      status: 404,
      message: 'Not found team'
    })
  }

  res.status(200).json({
    status: 200,
    message: 'sucess',
    data: dataUser
  })

}