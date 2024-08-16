import { defaultBefore, DefaultContext, finishTestDB } from "../../helpers/test-helpers";
import { inUserContext, UserFactory } from "../../helpers/user-factory";
import { createTransactions } from "../../helpers/transaction-factory";
import User from "../../../src/entity/user/user";
import { BuyerReportService, Report, SalesReportService } from "../../../src/service/report-service";
import { expect } from "chai";
import {
    seedContainers,
    seedPointsOfSale,
    seedProductCategories,
    seedProducts, seedTransactions,
    seedUsers,
    seedVatGroups
} from "../../seed";
import TransactionService from "../../../src/service/transaction-service";
import Transaction from "../../../src/entity/transactions/transaction";
import {In} from "typeorm";


const DAY = 86400000;
describe('ReportService', () => {
    let ctx: any & DefaultContext;

    before(async () => {
        ctx = {
            ...(await defaultBefore()),
        } as any;

        const users = await seedUsers();
        const vatGropus = await seedVatGroups();
        const categories = await seedProductCategories();
        const { productRevisions } = await seedProducts(users, categories, vatGropus);
        const { containerRevisions } = await seedContainers(users, productRevisions);
        const { pointOfSaleRevisions } = await seedPointsOfSale(users, containerRevisions);
        const { transactions } = await seedTransactions(users, pointOfSaleRevisions);

        ctx = {
            ...ctx,
            users,
            transactions,
        };
    });

    after(async () => {
        await finishTestDB(ctx.connection);
    });

    function checkReport(report: Report) {
        if (report.data.products) {
            let sumExclVat = 0;
            let sumInclVat = 0;
            report.data.products.forEach((entry) => {
                sumExclVat += entry.totalExclVat.getAmount();
                sumInclVat += entry.totalInclVat.getAmount();
                expect(entry.totalExclVat.getAmount()).to.eq(entry.count * Math.round(entry.product.priceInclVat.getAmount() / (1 + (entry.product.vat.percentage / 100))));
                expect(entry.totalInclVat.getAmount()).to.equal(entry.product.priceInclVat.getAmount() * entry.count);
            });
            expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
            expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
        }
        if (report.data.categories) {
            let sumExclVat = 0;
            let sumInclVat = 0;
            report.data.categories.forEach((entry) => {
                sumExclVat += entry.totalExclVat.getAmount();
                sumInclVat += entry.totalInclVat.getAmount();
            });
            expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
            expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
        }
        if (report.data.pos) {
            let sumExclVat = 0;
            let sumInclVat = 0;
            report.data.pos.forEach((entry) => {
                sumExclVat += entry.totalExclVat.getAmount();
                sumInclVat += entry.totalInclVat.getAmount();
            });
            expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
            expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
        }
        if (report.data.containers) {
            let sumExclVat = 0;
            let sumInclVat = 0;
            report.data.containers.forEach((entry) => {
                sumExclVat += entry.totalExclVat.getAmount();
                sumInclVat += entry.totalInclVat.getAmount();
            });
            expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
            expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
        }
        if (report.data.vat) {
            let sumExclVat = 0;
            let sumInclVat = 0;
            report.data.vat.forEach((entry) => {
                sumExclVat += entry.totalExclVat.getAmount();
                sumInclVat += entry.totalInclVat.getAmount();
            });
            expect(sumExclVat).to.equal(report.totalExclVat.getAmount());
            expect(sumInclVat).to.equal(report.totalInclVat.getAmount());
        }
    }

    async function createMultipleBuyersSingleSeller(buyerCount: number = 3, tester: (users: User[], transactions: { tId: number, amount: number }[]) => Promise<void>) {
        return inUserContext((await UserFactory()).clone(buyerCount + 1), async (...users: User[]) => {
            const [seller, ...buyers] = users;
            const transactions = [];
            for (let buyer of buyers) {
                transactions.push(...(await createTransactions(buyer.id, seller.id, 3)).transactions);
            }
            await tester([seller, ...buyers], transactions);
        });
    }

    describe('BuyerReportService', () => {
        it('should return the total income of a user', async () => {
            await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                const transaction = (await createTransactions(debtor.id, creditor.id, 1)).transactions[0];
                const parameters = {
                    fromDate: new Date(2000, 0, 0),
                    tillDate: new Date(2050, 0, 0),
                    forId: creditor.id,
                };
                const t = await new TransactionService().getSingleTransaction(transaction.tId);

                const report = await new SalesReportService().getReport(parameters);
                expect(report.totalInclVat.getAmount()).to.eq(t.totalPriceInclVat.amount);
                checkReport(report);
            });
        });

        it('should return the total income of a user with multiple transactions', async () => {
            await inUserContext((await UserFactory()).clone(3), async (debtor: User, creditor: User) => {
                const transactions = await createTransactions(debtor.id, creditor.id, 3);
                const parameters = {
                    fromDate: new Date(2000, 0, 0),
                    tillDate: new Date(2050, 0, 0),
                    forId: creditor.id,
                };
                const report = await new SalesReportService().getReport(parameters);
                expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                checkReport(report);
            });
        });

        it('should return an empty report when there are no transactions', async () => {
            await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                const parameters = {
                    fromDate: new Date(2000, 0, 0),
                    tillDate: new Date(2050, 0, 0),
                    forId: creditor.id,
                };
                const report = await new SalesReportService().getReport(parameters);
                expect(report.totalInclVat.getAmount()).to.eq(0);
                checkReport(report);
            });
        });

        it('should return the correct total income for multiple buyers buying from the same seller', async () => {
            await createMultipleBuyersSingleSeller(3, async (users, transactions) => {
                const [seller, buyer] = users;
                const parameters = {
                    fromDate: new Date(2000, 0, 0),
                    tillDate: new Date(2050, 0, 0),
                    forId: seller.id,
                };
                const report = await new SalesReportService().getReport(parameters);
                const totalInclVat = transactions.reduce((sum, t) => sum + t.amount, 0);
                expect(report.totalInclVat.getAmount()).to.eq(totalInclVat);
                checkReport(report);
            });
        });

        describe('fromDate filter', () => {
            it('should return the total income of a user with a transactions in the past', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, -5000);
                    const parameters = {
                        fromDate: new Date(),
                        tillDate: new Date(2050, 0, 0),
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(0);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with transactions right before the fromDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const fromDate = new Date(new Date().getTime() - 1000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, -3000);

                    const parameters = {
                        fromDate,
                        tillDate: new Date(2050, 0, 0),
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(0);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with transactions right after the fromDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const fromDate = new Date(new Date().getTime() - 2000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, -1000);
                    const parameters = {
                        fromDate,
                        tillDate: new Date(2050, 0, 0),
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with mixed transactions before and after the fromDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const fromDate = new Date(new Date().getTime() - 1500);
                    await createTransactions(debtor.id, creditor.id, 2, -2000);  // Before fromDate
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, -1000); // After fromDate
                    const parameters = {
                        fromDate,
                        tillDate: new Date(2050, 0, 0),
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });

            it('should return the total income of a user from the exact fromDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const fromDate = new Date();
                    const transactions = await createTransactions(debtor.id, creditor.id, 3);
                    const parameters = {
                        fromDate,
                        tillDate: new Date(2050, 0, 0),
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });
        });

        describe('tillDate filter', () => {
            it('should return the total income of a user with transactions before the tillDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const tillDate = new Date(new Date().getTime() + 1000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3);
                    const parameters = {
                        fromDate: new Date(2000, 0, 0),
                        tillDate,
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with transactions right after the tillDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const tillDate = new Date(new Date().getTime() + 1000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, 2000);
                    const parameters = {
                        fromDate: new Date(2000, 0, 0),
                        tillDate,
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(0);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with transactions right before the tillDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const tillDate = new Date(new Date().getTime() + 2000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, 1000);
                    const parameters = {
                        fromDate: new Date(2000, 0, 0),
                        tillDate,
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });

            it('should return the total income of a user with mixed transactions before and after the tillDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const tillDate = new Date(new Date().getTime() + 1500);
                    await createTransactions(debtor.id, creditor.id, 2, 2000);  // After tillDate
                    const transactions = await createTransactions(debtor.id, creditor.id, 3, 1000); // Before tillDate
                    const parameters = {
                        fromDate: new Date(2000, 0, 0),
                        tillDate,
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });

            it('should return the total income of a user till the exact tillDate', async () => {
                await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                    const tillDate = new Date(new Date().getTime() + 1000);
                    const transactions = await createTransactions(debtor.id, creditor.id, 3);
                    const parameters = {
                        fromDate: new Date(2000, 0, 0),
                        tillDate,
                        forId: creditor.id,
                    };
                    const report = await new SalesReportService().getReport(parameters);
                    expect(report.totalInclVat.getAmount()).to.eq(transactions.total);
                    checkReport(report);
                });
            });
        });

        it('should adhere to both fromDate and tillDate filters', async () => {
            await inUserContext((await UserFactory()).clone(2), async (debtor: User, creditor: User) => {
                const transactionsBefore = await createTransactions(debtor.id, creditor.id, 2, -40*DAY);
                let ids = transactionsBefore.transactions.map((t) => t.tId);
                let transactions = await Transaction.find({where: { id: In(ids)}});
                console.error(transactions);
                const fromDate = new Date(new Date().getTime() - DAY);
                const transactionsWithin = await createTransactions(debtor.id, creditor.id, 3, -2*DAY);  // Within range
                ids = transactionsWithin.transactions.map((t) => t.tId);
                transactions = await Transaction.find({where: { id: In(ids)}});
                console.error(transactions);
                const tillDate = new Date(new Date().getTime());
                // const transactionsAfter = await createTransactions(debtor.id, creditor.id, 2); // After tillDate
                const parameters = {
                    fromDate,
                    tillDate,
                    forId: creditor.id,
                };
                console.error('parameters', parameters);
                const report = await new SalesReportService().getReport(parameters);
                expect(report.totalInclVat.getAmount()).to.eq(transactionsWithin.total);
                checkReport(report);
            });
        });

        it('should correctly aggregate transactions from multiple buyers to the same seller', async () => {
            await createMultipleBuyersSingleSeller(3, async (users, transactions) => {
                const [seller, buyer] = users;
                const parameters = {
                    fromDate: new Date(2000, 0, 0),
                    tillDate: new Date(2050, 0, 0),
                    forId: seller.id,
                };
                const report = await new SalesReportService().getReport(parameters);
                const totalInclVat = transactions.reduce((sum, t) => sum + t.amount, 0);
                expect(report.totalInclVat.getAmount()).to.eq(totalInclVat);
                checkReport(report);
            });
        });
    });
});
