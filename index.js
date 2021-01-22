const fs = require('fs');
const csv = require('csv-parser');
const Task = require('./task.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tasks = [];
fs.createReadStream('tasks.csv')
.pipe(csv({}))
.on('data', (data) => tasks.push(data))
.on('end', () => {
    tasks.forEach((e) => {
        let task = new Task( e.EMAIL, e.ORDERNUMBER, e.WEBHOOK );
        task.initialize();
        await sleep(3000)
    })
});
