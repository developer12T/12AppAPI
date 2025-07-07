const axios = require('axios')
const { Option } = require('../../models/cash/option')
const  optionModel  = require('../../models/cash/option')
const { getModelsByChannel } = require('../../middleware/channel')

exports.getOption = async (req, res) => {
    try {
        const { module, type } = req.query
        const channel = req.headers['x-channel']; 
        const { Option } = getModelsByChannel(channel,res,optionModel); 

        if (!module, !type) {
            return res.status(400).json({ status: 400, message: 'module and type are required' })
        }
        let response = []
        const option = await Option.findOne(req.query)
        if (!option) {
            return res.status(404).json({
                status:404,
                message:"Not Found Option"
            })
        }
        response = option.list
        res.status(200).json({
            status: 200,
            message: 'Success',
            data: response
        })


    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '501', message: error.message })
    }
}

exports.addOption = async (req, res) => {
    try {
        const { type } = req.body
        const channel = req.headers['x-channel']; 
        const { Option } = getModelsByChannel(channel,res,optionModel); 
        if (!type) {
            return res.status(400).json({ status: 400, message: 'type is required!' })
        }

        const option = await Option.findOne({ type })

        if (option) {
            return res.status(400).json({ status: 400, message: `type ${type} is already exist` })
        }

        await Option.create(req.body)

        res.status(200).json({
            status: 200,
            message: 'Add Successfully',
        })

    } catch (error) {
        console.error(error)
        res.status(500).json({ status: '501', message: error.message })
    }
}