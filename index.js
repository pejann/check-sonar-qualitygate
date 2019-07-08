#!/usr/bin/env node

const path = require('path')
const program = require('commander')
const PropertiesReader = require('properties-reader')
const request = require('request-promise-native')

program
    .version('0.1.0', '--version')
    .option('-r, --report <string>', 'Path to post-analysis sonar\'s report file')
    .parse(process.argv)

const reportPath = path.resolve(__dirname, program.report)
if (!reportPath) {
    throw new Error(`Não foi possível encontrar o caminho: ${reportPath}`)
}

const properties = PropertiesReader(reportPath)
const taskId = properties.get('ceTaskId')
const taskUrl = properties.get('ceTaskUrl')
const serverUrl = properties.get('serverUrl')

if (!taskId || !taskUrl) {
    throw new Error(`Não foi possível encontrar as chaves taskId ou taskUrl no arquivo: ${reportPath}`)
}

const failedStatus = ['FAILED', 'CANCELED']
const pendingStatus = ['PENDING', 'IN_PROGRESS']
const sucessStatus = ['SUCCESS']

const interval = setInterval(() => {
    console.info('Enviando requisição para identificar situação da análise')

    request({ uri: taskUrl, json: true })
        .then(result => {

            if (failedStatus.includes(result.task.status)) {
                clearInterval(interval)
                throw new Error(`A análise terminou com status ${result.task.status}`)

            } else if (pendingStatus.includes(result.task.status)) {
                console.info('Análise ainda está pendente no SonarQube')
                return result.task

            } else if (sucessStatus.includes(result.task.status)) {
                clearInterval(interval)
                console.info('Análise finalizada, buscando Quality Gate')
                return result.task

            } else {
                clearInterval(interval)
                throw new Error(`Não foi possível recuperar o resultado`)
            }

        })
        .then(task => {
            const analysisId = task.analysisId
            if (!analysisId) {
                throw new Error('Não foi possível recuperar o id da análise')
            }

            const qualityGateUrl = `${serverUrl}/api/qualitygates/project_status?analysisId=${analysisId}`

            return request({ uri: qualityGateUrl, json: true })

        })
        .then(response => {
            if (!response || !response.projectStatus || !response.projectStatus.status) {
                throw new Error('Não foi possível recuperar o status do projeto')
            }

            if (response.projectStatus.status !== "SUCCESS") {
                throw new Error(`Quality Gate Status: ${response.projectStatus.status}`)
            }

            console.info('Quality Gate passou com sucesso')

        })
        .catch(err => {
            throw new Error(err)
        })

}, 1000)


