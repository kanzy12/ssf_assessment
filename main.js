//load node modules
const express = require('express');
const exphbs = require('express-handlebars');
const mysql = require('mysql');

//set tunables
const PORT = parseInt(process.argv[2] || 3000);
const commentsPerPage = 5;

//mysql queries
const sqlSelectBoardgameName = 'select gid, name, image from game where name like ?';
const sqlSelectBoardgameGid = 'select * from game where gid = ?';
const sqlSelectComments = `select * from comment where gid = ? limit ${commentsPerPage} offset ?`;
const sqlSelectCountComments = 'select count(*) from comment where gid = ?';
const sqlSelectCommentCid = 'select * from comment where c_id = ?';

//create mysql connection pool
const pool = mysql.createPool(
    require('./config.json')
);

//ping database
pool.getConnection((err, conn) => {
    if (err) {
        console.log('Cannot connect to database: ', err);
        process.exit(-1);
    }
    else {
        conn.ping((err) => {
            if (err) {
                console.log('Error pinging database: ', err);
                process.exit(-1);
            }
            else {
                console.log('Successfully pinged bgg database');
            }
        });
    }
});

//mysql helpers
const makeQuery = (pool, sqlQuery) => {
    return (params) => {
        return new Promise((resolve, reject) => {
            pool.getConnection((err, conn) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    conn.query(sqlQuery, params, (err, results) => {
                        conn.release();

                        if (err) {
                            console.log('Error making sql query: ', err);
                            reject(err);
                        }
                        else {
                            resolve(results);
                        }
                    });
                }
            });
        });
    }
}

const getBoardgameName = makeQuery(pool, sqlSelectBoardgameName);
const getBoardgameGid = makeQuery(pool, sqlSelectBoardgameGid);
const getComments = makeQuery(pool, sqlSelectComments);
const getCommentsCount = makeQuery(pool, sqlSelectCountComments);
const getCommentCid = makeQuery(pool, sqlSelectCommentCid);

//get instance of express
app = express();

//initialise handlebars stuff
const hbs = exphbs.create(
    {
        defaultLayout: 'main.hbs',
        extname: '.hbs',
        partialsDir: __dirname + '/views/partials'
    }
);
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', __dirname + '/views');

app.get('/search', (req ,res) => {
    let name = req.query['name'];

    getBoardgameName([`%${name}%`])
    .then((results) => {
        res.status(200);
        res.format({
            'text/html': () => {
                res.type('text/html');

                res.render('search', 
                {
                    query: name,
                    hasResults: results.length > 0,
                    games: results
                });
            },
            'application/json': () => {
                res.type('application/json');
                let resultsAddUrl = results.map(game => {
                    game['url'] = `/game/${game['gid']}`;
                    return game;
                });
                res.send(resultsAddUrl);
            }
        })
    })
    .catch(err => {
        console.log('Error getting results', err);
    });
})

app.get('/game/:gid', (req, res) => {
    let gid = parseInt(req.params['gid']);
    let offset = parseInt(req.query['offset']);
    if (!offset) {
        offset = 0;
    }

    Promise.all([getBoardgameGid(gid), getComments([gid, offset]), getCommentsCount(gid)])
    .then((results) => {
        let gameInfo = results[0][0];
        let comments = results[1];
        let totalCount = parseInt(results[2][0]['count(*)']);

        res.status(200);

        res.format({
            'text/html': () => {
                res.type('text/html');
                res.render('game', 
                {
                    game: gameInfo,
                    comments: comments,
                    firstComment: totalCount > 0? offset + 1 : 0,
                    lastComment: Math.min(offset + commentsPerPage, totalCount),
                    totalCount: totalCount,
                    hasPrevious: offset > 0,
                    previousOffset: offset - commentsPerPage,
                    hasNext: offset + commentsPerPage < totalCount,
                    nextOffset: offset + commentsPerPage,
                });
            },
            'application/json': () => {
                res.type('application/json');

                let commentsUrlArray = comments.map(comment => {
                    return `/comment/${comment.c_id}`;
                });
                gameInfo['comments'] =
                {
                    count: totalCount,
                    offset: offset, 
                    list: commentsUrlArray
                };
                
                res.send(gameInfo);
            }
        })
    })
    .catch((err) => {
        console.log('Error getting results', err);
    });
})

app.get('/comment/:c_id', (req, res) => {
    let c_id = req.params['c_id'];

    getCommentCid(c_id)
    .then(result => {
        res.status(200);
        
        let comment = result[0];

        res.format({
            'text/html': () => {
                res.type('text/html');
                res.render('partials/comment.hbs', comment);
            },
            'application/json': () => {
                res.type('application/json');
                comment['game'] = `/game/${comment.gid}`;
                res.send(result[0]);
            }
        })
    })
    .catch(err => {
        console.log('Error getting results', err);
    })
})

app.get(['/', '/index.html'], (req, res) => {
    res.status(200);
    res.type('text/html');
    res.render('query');
})

//serve public files
app.get(/.*/, express.static(__dirname + '/public'));

//start the server
app.listen(PORT, () => {
    console.info(`App started on port ${PORT} at ${new Date()}`);
});