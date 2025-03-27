const axios = require('axios')
const { Option } = require('../../models/cash/option')

exports.getOption = async (req, res) => {
    try {
        const { module, type } = req.query
        if (!module, !type) {
            return res.status(400).json({ status: 400, message: 'module and type are required' })
        }
        let response = []
        const option = await Option.findOne(req.query)
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