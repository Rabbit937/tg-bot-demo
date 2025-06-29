import dotenv from 'dotenv';
import { createConfig } from './src/utils/config.js';
import { createLogger } from './src/utils/logger.js';
import { DatabaseService } from './src/services/database.js';
import { CoinGeckoService } from './src/services/coingecko.js';
import { PriceComparisonService } from './src/services/priceComparison.js';
import { TelegramBotService } from './src/bot/bot.js';
import { SchedulerService } from './src/services/scheduler.js';

// 加载环境变量
dotenv.config();

class Application {
    private config = createConfig();
    private logger = createLogger(this.config.getLoggingConfig());
    private db!: DatabaseService;
    private coinGecko!: CoinGeckoService;
    private priceComparison!: PriceComparisonService;
    private bot!: TelegramBotService;
    private scheduler!: SchedulerService;

    async start(): Promise<void> {
        try {
            this.logger.info('Starting Telegram Bot Application...');

            // 验证必需的环境变量
            this.config.validateRequiredEnvVars();

            // 初始化服务
            await this.initializeServices();

            // 启动机器人
            await this.startBot();

            // 启动定时任务
            this.startScheduler();

            // 设置优雅关闭
            this.setupGracefulShutdown();

            this.logger.info('Application started successfully');
        } catch (error) {
            this.logger.error('Failed to start application', { error: (error as Error).message });
            process.exit(1);
        }
    }

    private async initializeServices(): Promise<void> {
        this.logger.info('Initializing services...');

        // 初始化数据库
        this.db = new DatabaseService(this.config.getDatabaseConfig());

        // 初始化CoinGecko服务
        this.coinGecko = new CoinGeckoService(this.config.getCoinGeckoConfig());

        // 初始化价格比较服务
        this.priceComparison = new PriceComparisonService({
            binance: this.config.getExchangeConfig('binance'),
            okx: this.config.getExchangeConfig('okx'),
            bybit: this.config.getExchangeConfig('bybit')
        });

        // 初始化机器人服务
        this.bot = new TelegramBotService(
            this.config.getBotConfig(),
            this.db,
            this.coinGecko,
            this.priceComparison
        );

        // 初始化调度器
        this.scheduler = new SchedulerService(
            this.config.getSchedulerConfig(),
            this.db,
            this.coinGecko,
            this.priceComparison,
            this.bot
        );

        this.logger.info('Services initialized successfully');
    }

    private async startBot(): Promise<void> {
        this.logger.info('Starting Telegram bot...');

        const botInfo = await this.bot.getBotInfo();
        this.logger.info('Bot started', {
            username: botInfo.username,
            id: botInfo.id
        });
    }

    private startScheduler(): void {
        this.logger.info('Starting scheduler...');
        // 调度器在构造函数中已经设置了默认任务
        this.logger.info('Scheduler started with default tasks');
    }

    private setupGracefulShutdown(): void {
        const shutdown = async (signal: string) => {
            this.logger.info(`Received ${signal}, shutting down gracefully...`);

            try {
                // 停止调度器
                this.scheduler.stop();

                // 停止机器人
                this.bot.stop();

                // 关闭数据库连接
                this.db.close();

                this.logger.info('Application shut down successfully');
                process.exit(0);
            } catch (error) {
                this.logger.error('Error during shutdown', { error: (error as Error).message });
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // 处理未捕获的异常
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception', { error: error.message, stack: error.stack });
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled rejection', { reason, promise });
            process.exit(1);
        });
    }
}

// 启动应用
const app = new Application();
app.start().catch((error) => {
    console.error('Failed to start application:', error);
    process.exit(1);
});